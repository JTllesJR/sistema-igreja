# Mockups do front-end

Desenhos **estáticos** das telas-chave, feitos antes de construir (ADR 0021, [plano](../plano-front-end.md)). Servem para validar o rumo
com o dono do projeto. **Dados fictícios; nenhuma marca da igreja** (a identidade visual ainda não existe, `PRODUCT.md`).

Abra `index.html` no navegador, ou veja os `.png`. Usam só os tokens do [`DESIGN.md`](../../DESIGN.md) (papel claro, cartões planos de
borda fina, cor só quando carrega informação, fonte do sistema) e o `mockup.css` desta pasta. Não são o código final: a fundação
(fatia 0) reimplementa tudo isto em React + Tailwind.

| Tela | Arquivo | Quem usa |
|---|---|---|
| Lançamentos | `01-lancamentos-computador` | Tesoureiro, computador |
| Nova entrada | `02-nova-entrada-computador` | Tesoureiro, computador |
| Início da Diretoria | `03-inicio-diretoria-celular` | Diretoria, celular |
| Fila de aprovação | `04-aprovacoes-celular` | Diretoria e sede, celular |
| Recusar com motivo | `05-recusar-celular` | Diretoria e sede, celular |
| Lista de membros | `06-membros-computador` | Secretário, computador |
| Ficha do membro | `07-membro-ficha-computador` | Secretário, computador |

## O que o desenho já ensinou

- **Contraste:** o cinza de apoio do `DESIGN.md` (`muted-ink`, `#64748b`) dá só **4,3:1** sobre o fundo do menu lateral (`track`,
  `#f1f5f9`), abaixo dos 4,5:1 do WCAG AA. No menu, o texto de apoio usa a tinta suave (`#475569`). Na fundação, vale registrar isso no
  `DESIGN.md`: sobre `track`, usar `soft-ink`.
- **Menu lateral** (computador) é uma segunda camada neutra (`track`), como a orientação de interfaces de trabalho sugere; o `DESIGN.md`
  atual só descreve navegação no cabeçalho.
- **Celular:** coluna única, valor em destaque, botões de 44 px e uma ação clara por cartão; a tabela do computador vira cartões.
