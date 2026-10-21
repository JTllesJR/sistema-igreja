import type { CurrentUser } from '@igreja/contracts';
import { ApiError, type AuthClient } from './client';

export type SessionState =
  /** Ao abrir a página: ainda tentando recuperar a sessão pelo cookie de renovação. */
  | { status: 'restoring' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: CurrentUser; accessToken: string };

export interface Timers {
  now(): number;
  setTimeout(task: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (task, ms) => globalThis.setTimeout(task, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
};

/** Quando renovar o token de acesso: um pouco antes de vencer (no máximo 60 s antes, e nunca mais que metade do prazo). */
export function msUntilRenewal(expiresAt: number, now: number): number {
  const remaining = expiresAt - now;
  const margin = Math.min(60_000, remaining / 2);
  return Math.max(0, remaining - margin);
}

const RETRY_AFTER_NETWORK_FAILURE_MS = 15_000;

/**
 * Guarda quem está logado. Fica FORA do React de propósito: é lógica de segurança (renovação do token, o que fazer
 * quando a sessão acaba) e assim pode ser testada sem tela. O React só a observa (`useSyncExternalStore`).
 *
 * O token de acesso vive apenas aqui, em memória: nunca em localStorage nem cookie legível por script, para que um
 * script injetado (XSS) não o leve embora (ADR 0011, seção 4). Ao recarregar a página, o cookie `httpOnly` de
 * renovação recupera a sessão (`restore`).
 */
export class SessionManager {
  #state: SessionState = { status: 'restoring' };
  readonly #listeners = new Set<() => void>();
  #renewalTimer: unknown = null;
  #restoring: Promise<void> | null = null;

  constructor(
    private readonly client: AuthClient,
    private readonly timers: Timers = browserTimers,
  ) {}

  /** Arrow function: precisa manter o `this` ao ser passada direto para `useSyncExternalStore`. */
  readonly getState = (): SessionState => this.#state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Tenta recuperar a sessão (ao abrir a página). Chamadas repetidas compartilham a mesma tentativa. */
  restore(): Promise<void> {
    this.#restoring ??= this.#restore();
    return this.#restoring;
  }

  async #restore(): Promise<void> {
    try {
      const tokens = await this.client.refresh();
      const user = await this.client.me(tokens.accessToken);
      // Se a pessoa já entrou ou saiu enquanto isso, o resultado desta tentativa não vale mais.
      if (this.#state.status !== 'restoring') return;
      this.#authenticate(user, tokens.accessToken, tokens.accessTokenExpiresAt);
    } catch {
      // Sem cookie, cookie vencido ou servidor fora do ar: em todos os casos a pessoa vai para a tela de entrada.
      if (this.#state.status === 'restoring')
        this.#set({ status: 'anonymous' });
    }
  }

  /** Falha com `ApiError` (a tela mostra a mensagem) e, nesse caso, o estado não muda. */
  async login(email: string, password: string): Promise<void> {
    const result = await this.client.login(email, password);
    this.#authenticate(
      result.user,
      result.accessToken,
      result.accessTokenExpiresAt,
    );
  }

  /** Sempre termina deslogado, mesmo que o servidor não responda: sair não pode depender da rede. */
  async logout(): Promise<void> {
    this.#cancelRenewal();
    this.#set({ status: 'anonymous' });
    try {
      await this.client.logout();
    } catch {
      // O cookie ainda pode existir no navegador; ele expira sozinho e a sessão no servidor vence por inatividade.
    }
  }

  #authenticate(
    user: CurrentUser,
    accessToken: string,
    expiresAtIso: string,
  ): void {
    this.#set({ status: 'authenticated', user, accessToken });
    this.#scheduleRenewal(Date.parse(expiresAtIso));
  }

  #scheduleRenewal(expiresAt: number, delay?: number): void {
    this.#cancelRenewal();
    this.#renewalTimer = this.timers.setTimeout(
      () => void this.#renewFromTimer(),
      delay ?? msUntilRenewal(expiresAt, this.timers.now()),
    );
  }

  /** O token de acesso atual, ou `null` se não há sessão. Só leitura: quem precisa de outro usa `renewAccessToken`. */
  getAccessToken(): string | null {
    return this.#state.status === 'authenticated'
      ? this.#state.accessToken
      : null;
  }

  /**
   * Troca o token de acesso agora (ex.: a API respondeu 401 porque ele venceu). Devolve o novo token, ou `null`
   * se a sessão acabou (e então a pessoa vai para a entrada). Falha de rede é repassada: o cookie continua valendo.
   * Várias chamadas ao mesmo tempo dividem uma só renovação (`AuthClient.refresh`).
   */
  async renewAccessToken(): Promise<string | null> {
    const current = this.#state;
    if (current.status !== 'authenticated') return null;

    try {
      const tokens = await this.client.refresh();
      // Saiu (ou outra chamada já renovou) durante a espera: não sobrescreve o estado mais novo.
      if (this.#state !== current) return this.getAccessToken();
      this.#set({ ...current, accessToken: tokens.accessToken });
      this.#scheduleRenewal(Date.parse(tokens.accessTokenExpiresAt));
      return tokens.accessToken;
    } catch (error) {
      if (this.#state !== current) return this.getAccessToken();
      if (error instanceof ApiError && error.code === 'network') throw error;
      this.#cancelRenewal();
      this.#set({ status: 'anonymous' });
      return null;
    }
  }

  async #renewFromTimer(): Promise<void> {
    try {
      await this.renewAccessToken();
    } catch {
      // Rede caiu: o cookie continua valendo, então tenta de novo em vez de deslogar.
      if (this.#state.status === 'authenticated') {
        this.#scheduleRenewal(0, RETRY_AFTER_NETWORK_FAILURE_MS);
      }
    }
  }

  #cancelRenewal(): void {
    if (this.#renewalTimer !== null)
      this.timers.clearTimeout(this.#renewalTimer);
    this.#renewalTimer = null;
  }

  #set(state: SessionState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}
