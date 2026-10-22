import { describe, expect, it } from 'vitest';
import { Email } from '../domain/email.js';
import { PlainPassword } from '../domain/plain-password.js';
import { RandomTemporaryPasswordGenerator } from './random-temporary-password-generator.js';

const generator = new RandomTemporaryPasswordGenerator();

describe('RandomTemporaryPasswordGenerator', () => {
  it('gera quatro grupos de quatro caracteres separados por hífen (fácil de ler e de ditar)', () => {
    expect(generator.generate()).toMatch(/^\S{4}-\S{4}-\S{4}-\S{4}$/);
  });

  it('usa só letras e dígitos sem ambiguidade: nada de 0 O 1 l I', () => {
    for (let i = 0; i < 500; i++) {
      const password = generator.generate().replaceAll('-', '');

      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
    }
  });

  it('sempre cumpre a política de senha do sistema', () => {
    const email = Email.create('maria@igreja.com');
    for (let i = 0; i < 200; i++) {
      expect(() =>
        PlainPassword.create(generator.generate(), email),
      ).not.toThrow();
    }
  });

  it('não repete: 2000 senhas, 2000 valores diferentes', () => {
    const generated = new Set(
      Array.from({ length: 2000 }, () => generator.generate()),
    );

    expect(generated.size).toBe(2000);
  });

  it('usa o alfabeto inteiro (nenhum caractere é sistematicamente excluído)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      for (const char of generator.generate().replaceAll('-', '')) {
        seen.add(char);
      }
    }

    // 24 maiúsculas (sem I e O) + 25 minúsculas (sem l) + 8 dígitos (2 a 9).
    expect(seen.size).toBe(57);
  });
});
