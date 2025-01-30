Hooks.once("init", async function () {
  console.log(
    "Kobold Knuckles | Initializing module with persistent gold balances"
  );

  game.koboldKnuckles = {
    players: {},

    startGame: function () {
      let players = game.users.filter((u) => u.active && !u.isGM);
      if (players.length === 0) {
        ui.notifications.warn("No active players found.");
        return;
      }

      players.forEach((player) => {
        let actor = game.actors.get(player.character?.id);
        if (!actor) {
          ui.notifications.warn(`${player.name} has no assigned character.`);
          return;
        }
        let gold = actor.system.currency?.gp || 0;
        game.koboldKnuckles.players[player.id] = {
          gold: gold,
          bet: 0,
          roll: null,
        };
      });

      game.koboldKnuckles.collectBets(players);
    },

    collectBets: function (players) {
      let betPromises = players.map((player) => {
        return new Promise((resolve) => {
          let playerData = game.koboldKnuckles.players[player.id];
          new Dialog({
            title: `Kobold Knuckles - Place Bet`,
            content: `<p>${player.name}, you have ${playerData.gold} gold. Enter your bet:</p>
                                  <input type="number" id="betAmount" value="10" min="1" max="${playerData.gold}"/>`,
            buttons: {
              ok: {
                label: "Bet",
                callback: (html) => {
                  let bet = parseInt(html.find("#betAmount").val());
                  if (bet > playerData.gold) bet = playerData.gold;
                  playerData.bet = bet;
                  playerData.gold -= bet;
                  resolve();
                },
              },
            },
            default: "ok",
          }).render(true);
        });
      });

      Promise.all(betPromises).then(() => {
        game.koboldKnuckles.rollDice(players);
      });
    },

    rollDice: function (players) {
      let dealerRoll = new Roll("1d6").roll({ async: false });
      let dealerHidden = new Roll("1d4").roll({ async: false });

      let results = `**Kobold Knuckles Begins!**\nDealer rolls: ${dealerRoll.total} + ? (Hidden)`;
      ChatMessage.create({
        content: results,
        whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
      });

      players.forEach((player) => {
        let playerRoll = new Roll("1d6 + 1d4").roll({ async: false });
        game.koboldKnuckles.players[player.id].roll = playerRoll.total;
        ChatMessage.create({
          user: player.id,
          content: `${player.name} rolls: ${playerRoll.total}`,
        });
      });

      game.koboldKnuckles.dealer = {
        open: dealerRoll.total,
        hidden: dealerHidden.total,
      };
    },

    revealDealer: function () {
      if (!game.koboldKnuckles.dealer) {
        ui.notifications.warn("No active game. Start a new round first.");
        return;
      }

      let dealerTotal =
        game.koboldKnuckles.dealer.open + game.koboldKnuckles.dealer.hidden;
      let resultMessage = `Dealer reveals: ${game.koboldKnuckles.dealer.hidden}. Total: ${dealerTotal}`;
      ChatMessage.create({ content: resultMessage });

      game.koboldKnuckles.resolveBets(dealerTotal);
      game.koboldKnuckles.dealer = null;
    },

    resolveBets: function (dealerTotal) {
      let payoutMessages = ["**Kobold Knuckles Results:**"];
      let players = game.users.filter((u) => u.active && !u.isGM);

      players.forEach((player) => {
        let playerData = game.koboldKnuckles.players[player.id];
        let winnings = 0;

        if (playerData.roll === 10) {
          winnings = playerData.bet * 2;
        } else if (playerData.roll > dealerTotal || dealerTotal > 10) {
          winnings = playerData.bet;
        } else {
          winnings = -playerData.bet;
        }

        playerData.gold += winnings;
        payoutMessages.push(
          `${player.name} ${winnings >= 0 ? "wins" : "loses"} ${Math.abs(
            winnings
          )} gold.`
        );

        let actor = game.actors.get(player.character?.id);
        if (actor) {
          actor.update({ "system.currency.gp": playerData.gold });
        }
      });

      ChatMessage.create({ content: payoutMessages.join("\n") });
    },

    cashOut: function (player) {
      let playerData = game.koboldKnuckles.players[player.id];
      let actor = game.actors.get(player.character?.id);
      if (actor && playerData) {
        actor.update({ "system.currency.gp": playerData.gold });
        ChatMessage.create({
          content: `${player.name} cashes out with ${playerData.gold} gold.`,
        });
        delete game.koboldKnuckles.players[player.id];
      }
    },
  };

  game.settings.registerMenu("kobold-knuckles", "startGame", {
    name: "Start Kobold Knuckles",
    label: "Start Game",
    hint: "Start a round of Kobold Knuckles with betting and persistent gold.",
    type: class {
      static onClick() {
        game.koboldKnuckles.startGame();
      }
    },
    restricted: true,
  });

  game.settings.registerMenu("kobold-knuckles", "revealDealer", {
    name: "Reveal Dealer",
    label: "Reveal Dealer's Roll",
    hint: "Reveal the dealer's hidden die and determine payouts.",
    type: class {
      static onClick() {
        game.koboldKnuckles.revealDealer();
      }
    },
    restricted: true,
  });
});
