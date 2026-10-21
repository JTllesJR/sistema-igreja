import { describe, expect, it } from 'vitest';
import { consultarSaude } from './health';

const respostaJson = (corpo: unknown, status = 200) =>
  (() =>
    Promise.resolve(
      new Response(JSON.stringify(corpo), { status }),
    )) as typeof fetch;

describe('consultarSaude', () => {
  it('valida e devolve o corpo quando está tudo certo', async () => {
    const estado = await consultarSaude(
      respostaJson({ status: 'ok', checks: { database: 'up' } }),
      'http://api',
    );
    expect(estado).toEqual({
      tipo: 'online',
      saude: { status: 'ok', checks: { database: 'up' } },
    });
  });

  it('aceita o 503 com banco fora, pois o corpo segue o contrato', async () => {
    const estado = await consultarSaude(
      respostaJson({ status: 'degraded', checks: { database: 'down' } }, 503),
      'http://api',
    );
    expect(estado.tipo).toBe('online');
  });

  it('rede indisponível vira offline', async () => {
    const falha = (() =>
      Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    expect(await consultarSaude(falha, 'http://api')).toEqual({
      tipo: 'offline',
    });
  });

  it('corpo fora do contrato vira resposta-invalida', async () => {
    expect(
      await consultarSaude(respostaJson({ ola: 1 }), 'http://api'),
    ).toEqual({
      tipo: 'resposta-invalida',
    });
  });

  it('corpo que não é JSON vira resposta-invalida', async () => {
    const html = (() =>
      Promise.resolve(new Response('<html>', { status: 200 }))) as typeof fetch;
    expect(await consultarSaude(html, 'http://api')).toEqual({
      tipo: 'resposta-invalida',
    });
  });
});
