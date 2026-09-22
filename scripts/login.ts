/*
  Connexion COROS depuis un terminal : `npm run login`.

  Le mot de passe est saisi masqué, envoyé à COROS, puis oublié. Seul le jeton
  de session est écrit, dans ~/.config/coros-workout-mcp/auth.json (0600).
  Il ne passe ni par la conversation avec l'assistant, ni par un fichier de
  configuration.

  À relancer quand le jeton expire. Attention : se connecter par l'API
  déconnecte la session web de la Training Hub.
*/
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { login } from "../src/coros-api.js";
import type { Region } from "../src/types.js";

function demander(question: string, masque = false): Promise<string> {
  let silencieux = false;
  const sortie = new Writable({
    write(chunk, _enc, done) {
      if (!silencieux) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output: sortie, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (reponse) => {
      rl.close();
      if (masque) process.stdout.write("\n");
      resolve(reponse.trim());
    });
    silencieux = masque;
  });
}

async function main(): Promise<void> {
  const email = await demander("Email COROS : ");
  const motDePasse = await demander("Mot de passe (masqué) : ", true);
  const saisie = (await demander("Région [eu] : ")) || "eu";
  if (saisie !== "eu" && saisie !== "us") throw new Error("Région : « eu » ou « us ».");

  const auth = await login(email, motDePasse, saisie as Region);
  console.log(`Connecté. Utilisateur ${auth.userId}, région ${auth.region}.`);
  console.log("Jeton enregistré dans ~/.config/coros-workout-mcp/auth.json");
}

main().catch((erreur: unknown) => {
  console.error(`Échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  process.exit(1);
});
