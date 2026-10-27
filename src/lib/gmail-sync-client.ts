"use client";

/* Protocole unique des boutons qui parlent à /api/gmail/sync.
   Deux écrans l'appellent (« Mes offres » et « Alertes Gmail ») : ils doivent
   envoyer exactement le même corps JSON. Le bouton de « Mes offres » envoyait
   un POST sans corps, que la route refusait en 400 « Requête invalide » —
   la synchronisation n'y démarrait donc jamais. */

export type GmailSyncAction =
  | "sync"
  | "relaunch_errors"
  | "relaunch_email"
  | "relaunch_offer"
  | "reanalyze_email"
  | "reanalyze_queue";

export type GmailSyncBody = {
  email: string;
  action: GmailSyncAction;
  emailId?: string;
  /** File de réanalyse : demander la reconstruction de la file. */
  queueReset?: boolean;
};

export function gmailSyncBody(
  email: string,
  action: GmailSyncAction = "sync",
  emailId?: string
): GmailSyncBody {
  return { email, action, ...(emailId ? { emailId } : {}) };
}

export function postGmailSync(
  email: string,
  action: GmailSyncAction = "sync",
  emailId?: string
): Promise<Response> {
  return fetch("/api/gmail/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(gmailSyncBody(email, action, emailId)),
  });
}

/** 409 = un lot tourne déjà (verrou serveur) : on attend puis on réessaie,
    plutôt que d'afficher un échec pour une simple concurrence d'onglets. */
export async function postGmailSyncLocked(
  email: string,
  action: GmailSyncAction = "sync",
  emailId?: string,
  options: { attempts?: number; waitMs?: number } = {}
): Promise<Response> {
  const attempts = options.attempts ?? 24;
  const waitMs = options.waitMs ?? 5000;
  let response = await postGmailSync(email, action, emailId);
  for (let attempt = 0; response.status === 409 && attempt < attempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await postGmailSync(email, action, emailId);
  }
  return response;
}
