# Roadmap e decisões técnicas — Auxiliar de Carteira

## Etapas

1. Inspecionar ambiente e arquivos.
2. Registrar roadmap e decisões (este arquivo).
3. Preparar o projeto e uma janela desktop funcional.
4. Montar a estrutura navegável das três áreas.
5. Persistência e lançamentos básicos.
6. Recorrências, parcelamentos e preservação do histórico.
7. Resumo mensal e cálculos.
8. Backup e restauração.
9. Validação e instalador Windows.

## Decisões técnicas

### Pilha

| Item | Escolha | Motivo |
| --- | --- | --- |
| Desktop | Electron | Pedido no escopo. |
| Build | electron-vite + Vite | Compila main, preload e renderer com um só comando. |
| Interface | React + TypeScript + CSS puro | Pedido no escopo. |
| Banco | better-sqlite3 v13 | Usa N-API e já traz binários prontos: o mesmo binário roda no Node e no Electron, sem compilar. A máquina não tem Python nem Build Tools. |
| Validação | zod | Os mesmos esquemas valem na interface e no processo principal. |
| Instalador | electron-builder (NSIS) | Gera o `.exe` de instalação. |
| Testes | Vitest + Playwright (Electron) | Regras e banco no Vitest; o aplicativo real no Playwright. |

`node:sqlite` foi descartado por ainda ser "release candidate".

### Camadas

- `src/shared/`: regras financeiras puras (sem banco nem interface), tipos e esquemas de validação.
- `src/main/`: janela, IPC, banco, migrações, backup.
- `src/preload/`: API restrita exposta à interface.
- `src/renderer/`: interface React.

### Modelo de dados

- **`series`**: a identidade de um lançamento (tipo, repetição, mês inicial, parcelas, mês de encerramento).
- **`series_versoes`**: os dados que mudam com o tempo (nome, valor, dia, categoria...), cada um com o mês a partir do qual vale. O valor de um mês é o da versão mais recente até aquele mês. Por isso uma alteração "a partir de" não muda os meses anteriores.
- **`ocorrencias`**: só existe linha quando um mês foge do padrão (valor realizado, edição pontual, exclusão pontual). `UNIQUE(serie_id, mes)`.

As ocorrências de cada mês são **calculadas**, não gravadas. Navegar entre meses não escreve nada no banco, então não há como criar duplicatas. A identidade de uma ocorrência é o par (série, mês).

### Regras de cálculo

- Valores em centavos inteiros. Datas como texto `AAAA-MM-DD` e meses como `AAAA-MM`, sem `Date` nos cálculos, o que elimina problemas de fuso horário.
- Valor considerado = realizado, se houver; senão, previsto. Os dois nunca são somados.
- Lazer e investimento são **reservas**: não têm valor realizado próprio. O uso vem de lançamentos ligados à reserva (gasto livre ou aporte).
- Um gasto ligado a uma reserva consome a reserva e não reduz o dinheiro livre novamente. Só o que ultrapassar a reserva reduz o restante.
- Orçamento livre = renda − compromissos − investimento reservado − lazer reservado.
- Restante = orçamento livre − gastos livres sem reserva − excedente de reservas − aportes sem reserva.
- "Fatura" é apenas um rótulo nos itens. O subtotal é derivado e nunca entra nos cálculos.

### Análises e gráficos

- "Gasto do mês" soma compromissos e gastos livres. Investimento não é gasto, e reserva de lazer só conta quando usada.
- Toda análise fica em `src/shared/analise.ts`, sem acesso a banco ou interface. O panorama cobre 5 meses antes e 11 depois do mês consultado.
- Gráficos em SVG e CSS próprios, sem biblioteca. A paleta vem do método de visualização do projeto e foi validada para daltonismo nos dois temas. O contraste baixo de duas cores no tema claro é compensado por legenda e tabela.
- Cor segue a entidade: Compromissos, Gastos livres, Lazer e Investimento têm a mesma cor em todos os gráficos.
- A preferência de tema fica no localStorage, por ser só visual. Nenhum dado financeiro passa por ali.

### Comportamentos definidos

- Edição "a partir de" substitui as versões posteriores. Edições pontuais já feitas em meses futuros continuam valendo, porque são exceções explícitas.
- Tipo e repetição não mudam depois de criados. Para corrigir, exclua e cadastre de novo.
- Encerrar ou excluir "esta e as futuras" mantém os meses anteriores. Se houver valor realizado depois do corte, o aplicativo pede confirmação.
- O vencimento guarda o dia original (ex.: 31) e usa o último dia válido em cada mês.
