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
      () => void this.#renew(),
      delay ?? msUntilRenewal(expiresAt, this.timers.now()),
    );
  }

  async #renew(): Promise<void> {
    const current = this.#state;
    if (current.status !== 'authenticated') return;

    try {
      const tokens = await this.client.refresh();
      // Saiu (ou entrou de novo) durante a renovação: não ressuscita a sessão antiga.
      if (this.#state !== current) return;
      this.#set({ ...current, accessToken: tokens.accessToken });
      this.#scheduleRenewal(Date.parse(tokens.accessTokenExpiresAt));
    } catch (error) {
      if (this.#state !== current) return;
      if (error instanceof ApiError && error.code === 'network') {
        // Rede caiu: o cookie continua valendo, então tenta de novo em vez de deslogar.
        this.#scheduleRenewal(0, RETRY_AFTER_NETWORK_FAILURE_MS);
        return;
      }
      this.#set({ status: 'anonymous' });
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
