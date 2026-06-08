# RogueBall 3D Football

RogueBall 3D Football é um jogo experimental de futebol 3D desenvolvido com **JavaScript** e **Three.js**, inspirado em futebol arcade, RPG e formato Kings League.

O projeto começou como uma arena simples de futebol e evoluiu para um sistema com jogadores procedurais, animações feitas por código, goleiros com inteligência própria, banco de reservas, mini mapa, câmeras diferentes, estilos táticos, dribles, passes carregados, chutes carregados e evolução da IA conforme a partida avança.

## Objetivo do projeto

O objetivo é criar uma experiência de futebol 3D dinâmica, onde a partida não dependa apenas do jogador principal, mas também da inteligência dos aliados, adversários e goleiros.

A ideia é misturar:

* futebol arcade;
* RPG de evolução;
* cartas com efeitos especiais;
* estilo Kings League;
* inteligência artificial tática;
* gameplay simples e divertida.

## Principais funcionalidades

### Jogadores procedurais

Os jogadores são criados diretamente por código, sem depender de modelos prontos com esqueleto ou animações externas.

Cada jogador possui:

* corpo procedural 3D;
* uniforme;
* cabelo;
* número;
* nome;
* chuteiras;
* animações manuais;
* movimentação independente;
* função tática dentro do time.

### Animações por código

O jogo possui animações feitas manualmente via JavaScript, incluindo:

* parado/idle;
* corrida;
* chute;
* passe;
* carrinho;
* roubo de bola;
* pedido de bola;
* dribles;
* defesa do goleiro;
* mergulho do goleiro;
* recuperação após ações.

### Goleiros com IA própria

Cada time possui um goleiro desde o início da partida.

Os goleiros contam com lógica própria para:

* acompanhar a bola;
* se posicionar dentro das traves;
* defender chutes;
* sair no 1 contra 1;
* escolher passes para jogadores livres;
* evitar sair demais para as laterais;
* gerar rebotes em algumas defesas;
* evoluir a inteligência ao longo do jogo.

### Inteligência artificial tática

A IA dos jogadores foi criada para evitar que todos corram atrás da bola ao mesmo tempo.

Os jogadores podem assumir comportamentos como:

* pressionar o jogador com a bola;
* abrir linha de passe;
* buscar rebote;
* proteger a entrada da área;
* marcar adversários;
* avançar para finalizar;
* tocar para jogadores melhor posicionados;
* evitar trombadas com companheiros;
* sair da marcação.

A inteligência dos times aumenta conforme o jogo avança, deixando as partidas mais difíceis e dinâmicas.

### Funções táticas

Os jogadores podem atuar com funções diferentes, como:

* atacante;
* meio-campista;
* zagueiro;
* goleiro.

Cada função influencia o posicionamento e o comportamento dentro da partida.

### Banco de reservas

O projeto possui banco de reservas na lateral do campo. Conforme novos jogadores entram, eles assumem posições e funções dentro da equipe, sem reiniciar completamente a partida.

### Sistema de rounds pausados

Ao fim de uma rodada, o jogo pausa em vez de resetar todos os jogadores e a bola.

Isso mantém a continuidade da partida e permite que novos jogadores ou melhorias sejam aplicados sem quebrar o ritmo do jogo.

### Estilos táticos

O jogador pode escolher o estilo de jogo do próprio time pelo HUD lateral.

Estilos disponíveis:

* equilibrado;
* agressivo;
* defensivo;
* mais passes.

Esses estilos influenciam a forma como os aliados se posicionam, pressionam, passam e atacam.

### Mini mapa

O jogo possui um mini mapa no HUD mostrando:

* jogadores aliados;
* jogadores adversários;
* goleiros;
* bola;
* jogador controlado.

Isso ajuda a acompanhar melhor a partida, principalmente com o campo maior.

### Câmeras

O jogo possui três modos de câmera:

* câmera focada no jogador;
* câmera estilo transmissão/FIFA;
* câmera focada na bola.

Controles:

```txt
1 = câmera do jogador
2 = câmera estilo transmissão
3 = câmera da bola
```

### Chute carregado

O chute é carregado segurando o botão esquerdo do mouse.

Quanto mais tempo o jogador segura, mais forte fica o chute.

```txt
Segurar M1 = carregar chute
Soltar M1 = chutar
```

### Passe carregado

O passe também pode ser carregado.

Quanto mais tempo o botão direito do mouse é segurado, mais forte será o passe.

```txt
Segurar M2 = carregar passe
Soltar M2 = passar
W + M2 forte = passe em profundidade
```

### Dribles

O jogador pode fazer dribles usando `Q` combinado com as teclas de movimento.

```txt
Q + W = finta/arrancada para frente
Q + S = puxada para trás
Q + A = corte para esquerda
Q + D = corte para direita
```

Os dribles possuem animação própria e não são apenas teleporte.

### Sistema de cartas

O projeto possui base para cartas com efeitos especiais, permitindo criar uma lógica inspirada em RPG/Kings League.

Exemplos de cartas possíveis:

* chute bomba;
* pressão total;
* muralha;
* velocidade extra;
* passe preciso;
* recuperação de estamina;
* defesa melhorada;
* contra-ataque.

### Estamina

O jogador possui barra de estamina.

A estamina é usada principalmente para corrida e pode se regenerar com o tempo.

## Controles

```txt
WASD = mover jogador
Mouse = mirar/direcionar ações
M1 = chute
Segurar M1 = carregar chute
M2 = passe
Segurar M2 = carregar passe
W + M2 forte = passe em profundidade
Q + W = drible para frente
Q + S = puxada para trás
Q + A = corte para esquerda
Q + D = corte para direita
F = carrinho
Espaço = tentar roubar a bola
E = pedir bola
Shift = trocar jogador
1 = câmera do jogador
2 = câmera transmissão/FIFA
3 = câmera da bola
```

## Tecnologias utilizadas

* JavaScript
* Three.js
* HTML
* CSS
* lógica procedural para personagens
* inteligência artificial simples/tática
* sistema de HUD em HTML/CSS

## Estrutura do projeto

```txt
/
├── index.html
├── style.css
├── start-server.bat
├── README.md
├── package.json
└── src/
    ├── main.js
    ├── game.js
    ├── player.js
    ├── goalkeeper.js
    ├── enemy.js
    ├── aiPlayer.js
    ├── ball.js
    ├── arena.js
    ├── collision.js
    ├── input.js
    ├── ui.js
    ├── cardManager.js
    ├── upgradeManager.js
    ├── upgrades.js
    ├── config.js
    └── utils.js
```

## Como rodar o projeto

### Opção 1: usando o arquivo `.bat`

No Windows, basta executar:

```txt
start-server.bat
```

Depois abra no navegador:

```txt
http://localhost:8080
```

### Opção 2: usando servidor local

Caso tenha Node.js instalado, você pode rodar um servidor local na pasta do projeto.

Exemplo:

```bash
npx serve .
```

Ou:

```bash
npx http-server .
```

Depois acesse o endereço exibido no terminal.

## Observações importantes

Este projeto é experimental e está em desenvolvimento.

Algumas partes foram feitas de forma procedural para evitar dependência de modelos externos, arquivos FBX, GLB ou animações prontas.

O foco atual é melhorar:

* jogabilidade;
* inteligência dos times;
* posicionamento tático;
* sensação de futebol;
* animações dos jogadores;
* sistema de progressão;
* cartas;
* interface;
* modo carreira/temporada.

## Ideias futuras

Algumas melhorias planejadas ou possíveis:

* modo carreira;
* tabela de campeonato;
* sistema de contratação;
* atributos individuais dos jogadores;
* cartas com raridade;
* faltas e cartões;
* escanteios;
* laterais;
* pênaltis;
* replay de gols;
* som de torcida;
* narração simples;
* personalização de uniforme;
* evolução permanente do elenco;
* ranking de artilharia e assistências;
* multiplayer local ou online no futuro.

## Status do projeto

Projeto em fase de protótipo jogável.

A base principal já possui:

* campo 3D;
* jogadores;
* goleiros;
* bola;
* colisão;
* IA;
* HUD;
* mini mapa;
* câmera;
* dribles;
* passes;
* chutes;
* banco de reservas;
* evolução de inteligência.

## Autor

Desenvolvido como projeto experimental de futebol 3D em JavaScript e Three.js.
