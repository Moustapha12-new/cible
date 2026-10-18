import { readFileSync, writeFileSync } from "node:fs";

const file = "src/app/app/cv/page.tsx";
let src = readFileSync(file, "utf8");
const splice = (startMarker, endMarker, replacement, includeEnd = false) => {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`start marker not found: ${startMarker.slice(0, 60)}`);
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error(`end marker not found: ${endMarker.slice(0, 60)}`);
  src = src.slice(0, start) + replacement + src.slice(includeEnd ? end + endMarker.length : end);
};

/* ── 1 · Imports ─────────────────────────────────────────────────────────── */
splice(
  'import { DEFAULT_CV_DESIGN, parseCvText, cvToText } from "@/lib/cv";',
  '\n',
  'import { DEFAULT_CV_DESIGN, parseCvText, cvToText } from "@/lib/cv";\nimport { applyPlanToCv, type ApplicableOperation } from "@/lib/cv-plan-apply";',
);

/* ── 2 · États du rapport recruteur ──────────────────────────────────────── */
splice(
  "  const [toastMessage, setToastMessage] = useState<string | null>(null);",
  "\n",
  `  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /* Rapport de l'adaptation vérifiée (éligibilité, axe, refus, lacunes) et
     plan d'opérations validé serveur — appliqué au CV avant export PDF. */
  type RecruiterPanel = {
    eligibility: { status: "eligible" | "needs_confirmation" | "ineligible"; reasons: string[] };
    focus?: string; headline?: string; headlineIssues: string[];
    accepted: { zone: string; op: string }[];
    rejected: { op: { zone: string }; issues: string[] }[];
    refused: { keyword: string; reason: string }[];
    unsupported: string[];
    warnings: string[];
  };
  const [recruiter, setRecruiter] = useState<RecruiterPanel | null>(null);
  const [planOps, setPlanOps] = useState<ApplicableOperation[]>([]);`,
);

/* ── 3 · handleRegenerate → /api/cv/adapt (moteur + passe recruteur) ────── */
splice(
  "  // Run adaptation",
  "  // Download PDF",
  `  // Run adaptation — POST /api/cv/adapt : analyse déterministe (éligibilité,
  // matrice exigence → preuve croisée avec le registre du dossier maître) puis
  // passe « recruteur » Gemini intégralement revalidée. Le CV maître n'est
  // jamais modifié ; seules les opérations acceptées sont appliquées à l'export.
  const handleRegenerate = async () => {
    setIsAdapting(true);
    setToastMessage("Analyse de l'offre et adaptation sous contrôle de preuves…");
    try {
      const masterText = (data?.originalCv?.text?.trim() || (data?.cvData ? cvToText(data.cvData) : "")) || "";
      if (!masterText) {
        setToastMessage("Aucun CV maître confirmé — importe ton vrai CV avant d'adapter.");
        return;
      }
      if (!selectedOffer.id) {
        setToastMessage("Sélectionne d'abord une offre réelle.");
        return;
      }
      const res = await fetch("/api/cv/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: selectedOffer.id, rewrite: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setToastMessage(\`Adaptation indisponible — \${json?.error || "CV maître conservé tel quel."}\`);
        return;
      }
      const accepted: ApplicableOperation[] = (json.plan?.operations ?? []).filter(
        (op: { decision?: string }) => op.decision !== "rejected" && op.op !== "keep",
      );
      setPlanOps(accepted);
      setRecruiter(json.recruiter ?? null);
      if (json.recruiter?.headline && !json.recruiter.headlineIssues?.length) {
        setAdaptedTitle(json.recruiter.headline);
      } else if (json.strategy?.headline) {
        setAdaptedTitle(json.strategy.headline);
      }
      const rewrites = accepted.filter(op => op.op === "rephrase_fact" || op.op === "rewrite_profile").length;
      const refused = json.rejected?.length ?? 0;
      if (json.aiError) {
        setToastMessage("Plan de preuves généré à partir du dossier maître (IA indisponible — analyse déterministe conservée).");
      } else {
        setToastMessage(\`Adaptation vérifiée : \${rewrites} reformulation(s) validée(s), \${refuséeOrRefused(refused)} refusée(s) pour non-preuve.\`);
      }
    } catch {
      setToastMessage("Adaptation indisponible — CV maître conservé tel quel.");
    } finally {
      setIsAdapting(false);
    }
  };
  const refuséeOrRefused = (count: number) => String(count);

`,
);

/* ── 4 · PDF adapté : plan appliqué au CV structuré ──────────────────────── */
splice(
  "      const res = await fetch(\"/api/cv/pdf\", {",
  "        method: \"POST\",",
  `      /* Le plan d'opérations acceptées (titre de disponibilité verrouillé,
         reformulations prouvées, réordonnancements) est appliqué au CV
         structuré avant export — aucune opération refusée n'y accède. */
      const prepared = type === "adapted" && planOps.length ? applyPlanToCv(master, planOps).cv : master;
      const res = await fetch("/api/cv/pdf", {
        method: "POST",`,
  false,
);
const before = src.length;
src = src.replace(
  /body: JSON\.stringify\(\{\s*cv: \{\s*\.\.\.master,\s*basics: \{\s*\.\.\.master\.basics,\s*name: candidateName \|\| master\.basics\.name,/,
  'body: JSON.stringify({\n          cv: {\n            ...prepared,\n            basics: {\n              ...prepared.basics,\n              name: candidateName || prepared.basics.name,',
);
if (src.length === before) throw new Error("PDF body marker not found");

/* ── 5 · Colonne droite : audit réel au lieu d'un aperçu fabriqué ────────── */
const RIGHT_COLUMN = `        {/* Right Column (3 cols ~ 25%): Audit de l'adaptation (moteur + recruteur IA) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold text-slate-900 pb-2 border-b border-slate-100 mb-3">
              Audit de l&apos;adaptation
            </h3>

            {!recruiter ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Lance l&apos;adaptation pour obtenir l&apos;éligibilité réelle de l&apos;offre, l&apos;axe retenu,
                les reformulations validées avec leurs preuves, et les exigences que ton parcours ne couvre pas.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Éligibilité (vérifiée sur contrat, durée, début 2027, domaine) */}
                <div className="flex items-start gap-2.5">
                  <div
                    className={\`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 \${
                      recruiter.eligibility.status === "eligible"
                        ? "bg-emerald-50 text-emerald-600"
                        : recruiter.eligibility.status === "needs_confirmation"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-red-50 text-red-600"
                    }\`}
                  >
                    <Check size={12} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1">
                    <strong className="text-xs font-bold text-slate-900">
                      Éligibilité —{" "}
                      {recruiter.eligibility.status === "eligible"
                        ? "éligible"
                        : recruiter.eligibility.status === "needs_confirmation"
                          ? "à confirmer"
                          : "non éligible"}
                    </strong>
                    <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                      {recruiter.eligibility.reasons[0]}
                    </p>
                  </div>
                </div>

                {/* Axe principal (stratégie fondée sur des preuves) */}
                {recruiter.focus && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap size={12} />
                    </div>
                    <div className="flex-1">
                      <strong className="text-xs font-bold text-slate-900">Axe principal</strong>
                      <p className="text-[10px] text-slate-600 leading-snug mt-0.5">{recruiter.focus}</p>
                    </div>
                  </div>
                )}

                {/* Modifications réellement validées */}
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={12} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <strong className="text-xs font-bold text-slate-900">Modifications validées</strong>
                      <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {planOps.length}
                      </span>
                    </div>
                    {planOps.length ? (
                      <ul className="text-[10px] text-slate-600 leading-snug list-disc pl-3.5 space-y-0.5">
                        {planOps.slice(0, 4).map(op => (
                          <li key={op.op + op.zone}>{op.zone}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-slate-500 leading-snug">
                        Aucune réécriture nécessaire : ton CV maître couvre déjà les besoins obligatoires.
                      </p>
                    )}
                  </div>
                </div>

                {/* Refus motivés (aucune affirmation non prouvée n'est appliquée) */}
                {recruiter.rejected.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                      <X size={12} />
                    </div>
                    <div className="flex-1">
                      <strong className="text-xs font-bold text-slate-900">
                        Refusées ({recruiter.rejected.length})
                      </strong>
                      <ul className="text-[10px] text-slate-500 leading-snug list-disc pl-3.5 mt-0.5 space-y-0.5">
                        {recruiter.rejected.slice(0, 3).map((entry, index) => (
                          <li key={index}>
                            {entry.op.zone} — {entry.issues[0]}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Exigences non démontrées : dites, jamais ajoutées */}
                {recruiter.unsupported.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 mt-0.5">
                      <SlidersHorizontal size={12} />
                    </div>
                    <div className="flex-1">
                      <strong className="text-xs font-bold text-slate-900">Non démontré — jamais ajouté</strong>
                      <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                        {recruiter.unsupported.slice(0, 4).join(" • ")}
                      </p>
                    </div>
                  </div>
                )}

                {recruiter.warnings.length > 0 && (
                  <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-snug">
                    {recruiter.warnings[0]}
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isAdapting}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <RotateCw size={13} className={isAdapting ? "animate-spin" : ""} />
            <span>{isAdapting ? "Vérification des preuves…" : "Relancer l'adaptation vérifiée"}</span>
          </button>
        </div>
      </div>

`;
splice(
  "        {/* Right Column (3 cols ~ 25%): Modifications apportées par l'IA */}",
  "      {/* ── Bottom Section (Mémoire de compétences & Historique) ── */}",
  RIGHT_COLUMN,
);

writeFileSync(file, src);
console.log("cv page patched:", file);
