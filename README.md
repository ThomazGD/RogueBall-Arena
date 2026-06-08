# RogueBall 3D Football - IA Tática + Drible Animado

Versão com foco em deixar o jogo menos "NPC correndo atrás da bola" e mais parecido com futebol.

## Novidades desta versão

- IA tática mais forte:
  - um jogador pressiona a bola;
  - um jogador cobre linha de passe/chute;
  - atacantes abrem para rebote;
  - meias procuram passe curto;
  - zagueiros protegem a entrada da área.
- Correção da aglomeração perto do gol:
  - jogadores do mesmo time não ficam todos atrás da bola;
  - quem não é o perseguidor abre para passe, rebote ou cobertura.
- Rival mais objetivo:
  - avança mais quando está com a bola;
  - finaliza mais quando tem ângulo;
  - para de ficar só tocando sem atacar.
- Goleiro reequilibrado:
  - fica mais central dentro das traves;
  - não abre tanto para a lateral antes da hora;
  - ainda defende, mas 1x1 ficou mais possível.
- Drible no Q refeito:
  - não é mais teleporte;
  - agora é um arranque curto com animação corporal;
  - inspirado em finta de corpo, step-over, corte lateral e puxada.

## Controles principais

- WASD: movimentar
- W duas vezes: correr
- Segurar M1: carregar chute
- Segurar M2: carregar passe
- Q + W: finta/arrancada para frente
- Q + S: puxada para trás
- Q + A: corte para esquerda
- Q + D: corte para direita
- F: carrinho
- Espaço: tentar roubar
- Shift: trocar jogador
- E: pedir bola
- 1/2/3: trocar câmera

## Rodar

1. Extraia o ZIP.
2. Execute `start-server.bat`.
3. Abra `http://localhost:8080`.
