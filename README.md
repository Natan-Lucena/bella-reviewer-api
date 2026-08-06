# Bella Reviewer — Backend

<p align="center">
  <img src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTF1d3M5MjNuMXltN2FwenBtaW8xdDQ2cmxqYWN4azgwemNwam5ybyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iL7on8VbqU7tu/giphy.gif" alt="Bella" width="280">
</p>

Bella é a especialista em code review que nunca dorme: fareja bugs, falhas de segurança e código suspeito em cada Pull Request antes que virem problema em produção. O nome é uma homenagem a uma dálmata que certamente teria uma opinião forte sobre a qualidade do seu código.

API backend da Bella Reviewer, uma plataforma de code review assistido por IA. Recebe o diff de um Pull Request via GitHub Action ou webhook, roda o diff por um pipeline de revisão baseado em LLM, e publica os comentários de volta no PR — registrando o consumo de tokens de cada execução para visibilidade de custo. Este repositório é só a API; cadastro, configuração de repositórios e acompanhamento de execuções acontecem no [painel web](https://github.com/Natan-Lucena/bella-review-web), e o disparo automático de revisões via CI vem da [GitHub Action](https://github.com/Natan-Lucena/bella-review-action).

## Stack

- Node.js 22.13+, TypeScript, Express
- Prisma + Postgres (Neon em produção, `docker-compose` local)
- Vitest
- ESLint + Prettier
- pnpm

## O que a Bella faz

Bella Reviewer se conecta a um repositório GitHub e, a cada Pull Request aberto, atualizado ou reaberto, analisa o diff e publica comentários de revisão diretamente no PR — como mais um revisor no time, sempre disponível e sem cansar.

Diferente de ferramentas que analisam arquivo por arquivo, a Bella olha o Pull Request inteiro de uma vez só: título, descrição e todos os arquivos alterados juntos, numa única passada. Isso importa porque boa parte dos problemas reais só aparece quando se olha o PR como um todo — uma mudança de assinatura de função num arquivo que quebra um chamador em outro, uma inconsistência entre duas partes do mesmo PR, a intenção descrita na descrição não batendo com o que o código realmente faz. Um revisor que só vê um arquivo por vez nunca pegaria isso.

## Como funciona

Existem dois jeitos de disparar uma revisão — cada repositório escolhe o que preferir, ou usa os dois:

- **GitHub Action**, instalada no workflow do próprio repositório: calcula o diff do PR e avisa a Bella.
- **Webhook nativo do GitHub**: a Bella escuta os eventos de Pull Request diretamente, sem precisar rodar nada no CI do repositório.

A partir daí o fluxo é o mesmo. A confirmação de recebimento é imediata — quem abriu o PR não fica esperando a análise terminar, ela acontece em segundo plano. Cada execução fica registrada com o consumo de tokens (entrada, saída, raciocínio) e o histórico de comentários gerados, dando visibilidade de custo e de qualidade ao longo do tempo.

## Fluxo de uma revisão

1. Um Pull Request é aberto, recebe um novo commit, ou é reaberto.
2. A Bella recebe o diff completo — pela Action ou pelo webhook — e confirma o recebimento na hora.
3. Em segundo plano, monta uma única chamada ao modelo de linguagem configurado, com o PR inteiro como contexto (diff completo, mais título e descrição).
4. O modelo devolve uma lista de comentários — arquivo, linha, categoria, severidade, a explicação e, quando existe uma correção concreta e local (não só uma observação ou trade-off), o código sugerido.
5. Cada comentário é publicado de volta no Pull Request, na linha certa. Quando há código sugerido, ele vira um bloco "Apply suggestion" nativo do GitHub — um clique do desenvolvedor já aplica a mudança.
6. A Bella reconcilia sozinha, a cada novo push, fechamento do PR ou resolução de thread, se cada sugestão foi de fato aplicada. Tokens consumidos, comentários gerados e o destino de cada sugestão ficam registrados e disponíveis para consulta — histórico de execuções, comentários por PR, consumo por período, e métricas de aceitação (taxa de aplicação geral/por categoria/por severidade, custo por sugestão aplicada).

Se o diff for grande demais para o limite de contexto configurado, a Bella prefere falhar a execução inteira a fazer uma revisão parcial disfarçada de completa — nenhuma revisão é melhor do que uma revisão que parece ter coberto tudo e não cobriu.

## Desenvolvimento

Arquitetura, setup local e testes: veja o [CONTRIBUTING.md](./CONTRIBUTING.md).
