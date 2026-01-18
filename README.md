# 💣 Bomberzinho 64px

Um jogo multiplayer de arena em tempo real inspirado no clássico Bomberman. O projeto utiliza **Node.js** com **Socket.io** para a comunicação entre jogadores e a engine **Phaser 3** para renderização gráfica e física no navegador.

---

## 🚀 Funcionalidades Implementadas

- **Multiplayer em Tempo Real:** Sincronização de movimento e ações entre múltiplos clientes.
- **Geração Dinâmica de Mapa:** Paredes fixas e blocos destrutíveis gerados aleatoriamente a cada nova partida.
- **Sistema de Power-ups (Itens):**
  - 🏎️ **Patins (Velocidade):** Reduz o tempo de deslocamento entre os blocos.
  - 🔥 **Fogo (Alcance):** Aumenta a distância da explosão das bombas.
  - 💣 **Bomba Extra:** Aumenta a quantidade máxima de bombas que o jogador pode colocar simultaneamente.
- **Validação no Servidor:** Toda a lógica de colisão e explosão ocorre no servidor para evitar trapaças.

---

## 🎮 Como Jogar

### Pré-requisitos
Antes de começar, você precisará ter instalado em sua máquina:
* [Node.js](https://nodejs.org/) (Versão 14 ou superior)
* Gerenciador de pacotes (NPM já vem com o Node)

### Instalação
1. Clone o repositório:
   git clone [https://github.com/pablotic123/bomberzinho.git](https://github.com/pablotic123/bomberzinho.git)
2. Entre na pasta do projeto:
   cd bomberzinho
3. Instale as dependências:
   npm install

### iniciando o jogo
1. inicie o servidor:
   npm start
   (Ou node server/index.js caso não tenha configurado o script de start)
3. Abra o navegador e acesse:
   http://localhost:3000

### ⌨️ Coontroles e comandos
**Setas do Teclado:** "Movimentar o personagem (Cima, Baixo, Esquerda, Direita)"
**Barra de Espaço:** Colocar Bomba
**F5:** Reiniciar/Entrar em uma nova partida

### 🗺️ Estrutura do Projeto
├── client/
│   ├── assets/          # Spritesheets (player.png, tiles.png)
│   ├── src/
│   │   └── game.js      # Lógica do cliente e renderização Phaser
│   └── index.html       # Estrutura principal e carregamento de scripts
├── server/
│   └── index.js         # Lógica do servidor, sockets e colisões
├── package.json         # Dependências do projeto
└── README.md            # Documentação (este arquivo)

### 💡 Próximos Passos (Roadmap)
[ ] Implementação de sistema de salas (Rooms).
[ ] Adição de trilha sonora e efeitos sonoros (Sfx).
[ ] Inteligência Artificial para Bots.
[ ] Sistema de Score e Ranking.

### 📝 Licença
Este projeto é para fins de estudo e aprendizado. Sinta-se à vontade para usar e modificar!

### Contato
Autor: Pablo Tic (pablotic123) E-mail: pablotic123@gmail.com GitHub: pablotic123
