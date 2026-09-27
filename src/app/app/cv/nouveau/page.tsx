"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type Profile } from "@/lib/data";

const STEPS = ["Identité", "Expériences", "Formation", "Compétences", "Récapitulatif"];

const emptyExp = { title: "", place: "", period: "", detail: "" };
const emptyEdu = { degree: "", school: "", period: "" };

export default function CvWizardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>({
    firstName: "",
    lastName: "",
    title: "",
    email: user?.email ?? "",
    phone: "",
    city: "",
    skills: [],
    experiences: [{ ...emptyExp }],
    educations: [{ ...emptyEdu }],
  });
  const [skillsRaw, setSkillsRaw] = useState("");

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));

  const finish = () => {
    if (!user) return;
    const finalProfile: Profile = {
      ...profile,
      email: user.email,
      skills: skillsRaw.trim()
        ? skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : profile.skills,
    };
    const data = getOrCreateData(user.name, user.email);
    const next = {
      ...data,
      profile: finalProfile,
      cvs: [
        ...data.cvs,
        {
          id: Math.random().toString(36).slice(2, 9),
          name: "CV créé avec l'assistant",
          file: `${profile.firstName}_${profile.lastName}_cv.pdf`.toLowerCase(),
          score: 68,
          date: "à l'instant",
        },
      ],
    };
    saveData(user.email, next);
    router.push("/app/cv");
  };

  const canNext =
    (step === 0 && profile.firstName.trim() && profile.lastName.trim()) ||
    (step === 1 && profile.experiences.some((e) => e.title.trim())) ||
    (step === 2 && profile.educations.some((e) => e.degree.trim())) ||
    (step === 3 && skillsRaw.trim().length > 1) ||
    step === 4;

  return (
    <div className="max-w-2xl">
      {/* Progression */}
      <div className="flex items-center gap-2 mb-10" aria-hidden="true">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div
              className={`h-1 rounded-full transition-colors duration-500 ${
                i <= step ? "bg-mint" : "bg-surface-2"
              }`}
            />
            <p className={`mono-label mt-2 text-[0.56rem]! ${i === step ? "text-mint" : ""}`}>
              {i + 1}. {label}
            </p>
          </div>
        ))}
      </div>

      <div className="glass-card p-8">
        {step === 0 && (
          <>
            <h2 className="font-display text-xl font-semibold mb-6">Qui es-tu ?</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="field block"><span className="mono-label mb-2 block">Prénom *</span>
                <input className="input" value={profile.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Camille" /></label>
              <label className="field block"><span className="mono-label mb-2 block">Nom *</span>
                <input className="input" value={profile.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Dubois" /></label>
              <label className="field block sm:col-span-2"><span className="mono-label mb-2 block">Titre professionnel</span>
                <input className="input" value={profile.title} onChange={(e) => set("title", e.target.value)} placeholder="Étudiant·e M1 Marketing — en recherche d'alternance" /></label>
              <label className="field block"><span className="mono-label mb-2 block">Téléphone</span>
                <input className="input" value={profile.phone} onChange={(e) => set("phone", e.target.value)} placeholder="06 12 34 56 78" /></label>
              <label className="field block"><span className="mono-label mb-2 block">Ville</span>
                <input className="input" value={profile.city} onChange={(e) => set("city", e.target.value)} placeholder="Paris 11ᵉ" /></label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="font-display text-xl font-semibold mb-6">Tes expériences</h2>
            <div className="space-y-4">
              {profile.experiences.map((exp, i) => (
                <fieldset key={i} className="border border-line rounded-xl p-5 space-y-3">
                  <legend className="mono-label px-2">Expérience {i + 1}</legend>
                  <input className="input" placeholder="Intitulé du poste" value={exp.title}
                    onChange={(e) => setProfile((p) => ({ ...p, experiences: p.experiences.map((x, j) => j === i ? { ...x, title: e.target.value } : x) }))} />
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input className="input" placeholder="Entreprise / structure" value={exp.place}
                      onChange={(e) => setProfile((p) => ({ ...p, experiences: p.experiences.map((x, j) => j === i ? { ...x, place: e.target.value } : x) }))} />
                    <input className="input" placeholder="Période — ex. 2024–2025" value={exp.period}
                      onChange={(e) => setProfile((p) => ({ ...p, experiences: p.experiences.map((x, j) => j === i ? { ...x, period: e.target.value } : x) }))} />
                  </div>
                  <textarea className="input" rows={2} placeholder="Réalisations chiffrées — ex. +240 % de trafic en un an"
                    value={exp.detail}
                    onChange={(e) => setProfile((p) => ({ ...p, experiences: p.experiences.map((x, j) => j === i ? { ...x, detail: e.target.value } : x) }))} />
                  {profile.experiences.length > 1 && (
                    <button type="button" className="btn-line"
                      onClick={() => setProfile((p) => ({ ...p, experiences: p.experiences.filter((_, j) => j !== i) }))}>
                      Retirer
                    </button>
                  )}
                </fieldset>
              ))}
            </div>
            <button type="button" className="btn-line mt-4"
              onClick={() => setProfile((p) => ({ ...p, experiences: [...p.experiences, { ...emptyExp }] }))}>
              ＋ Ajouter une expérience
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-display text-xl font-semibold mb-6">Ta formation</h2>
            <div className="space-y-4">
              {profile.educations.map((edu, i) => (
                <fieldset key={i} className="border border-line rounded-xl p-5 space-y-3">
                  <legend className="mono-label px-2">Diplôme {i + 1}</legend>
                  <input className="input" placeholder="Intitulé — ex. Master 1 Marketing Digital" value={edu.degree}
                    onChange={(e) => setProfile((p) => ({ ...p, educations: p.educations.map((x, j) => j === i ? { ...x, degree: e.target.value } : x) }))} />
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input className="input" placeholder="École / université" value={edu.school}
                      onChange={(e) => setProfile((p) => ({ ...p, educations: p.educations.map((x, j) => j === i ? { ...x, school: e.target.value } : x) }))} />
                    <input className="input" placeholder="Période — ex. 2025–2026" value={edu.period}
                      onChange={(e) => setProfile((p) => ({ ...p, educations: p.educations.map((x, j) => j === i ? { ...x, period: e.target.value } : x) }))} />
                  </div>
                  {profile.educations.length > 1 && (
                    <button type="button" className="btn-line"
                      onClick={() => setProfile((p) => ({ ...p, educations: p.educations.filter((_, j) => j !== i) }))}>
                      Retirer
                    </button>
                  )}
                </fieldset>
              ))}
            </div>
            <button type="button" className="btn-line mt-4"
              onClick={() => setProfile((p) => ({ ...p, educations: [...p.educations, { ...emptyEdu }] }))}>
              ＋ Ajouter une formation
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-display text-xl font-semibold mb-3">Tes compétences</h2>
            <p className="text-[0.85rem] text-muted mb-6 leading-relaxed">
              Sépare-les par des virgules. Ce sont elles qui sont confrontées aux offres lors du matching ATS.
            </p>
            <textarea
              className="input"
              rows={4}
              value={skillsRaw}
              onChange={(e) => setSkillsRaw(e.target.value)}
              placeholder="SEO, Rédaction web, Google Analytics, Réseaux sociaux…"
            />
            {skillsRaw.trim() && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {skillsRaw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                  <span key={s} className="chip chip--mint">{s}</span>
                ))}
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="font-display text-xl font-semibold mb-6">Tout est bon ?</h2>
            <dl className="space-y-4 text-[0.9rem]">
              <div><dt className="mono-label mb-1">Identité</dt>
                <dd>{profile.firstName} {profile.lastName}{profile.title && <> — <em className="text-muted">{profile.title}</em></>}</dd></div>
              <div><dt className="mono-label mb-1">Expériences</dt>
                <dd className="text-text-dim">{profile.experiences.filter((e) => e.title.trim()).map((e) => e.title).join(" · ") || "—"}</dd></div>
              <div><dt className="mono-label mb-1">Formation</dt>
                <dd className="text-text-dim">{profile.educations.filter((e) => e.degree.trim()).map((e) => e.degree).join(" · ") || "—"}</dd></div>
              <div><dt className="mono-label mb-1">Compétences</dt>
                <dd className="flex flex-wrap gap-1.5 mt-1">
                  {(skillsRaw.split(",").map((s) => s.trim()).filter(Boolean)).map((s) => (
                    <span key={s} className="chip">{s}</span>
                  ))}
                </dd></div>
            </dl>
            <p className="mt-6 text-[0.8rem] text-muted">
              Un CV de départ sera créé avec un score ATS estimé à 68/100 — améliore-le ensuite via le matching.
            </p>
          </>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-4 mt-10 pt-6 border-t border-line">
          <button type="button" className="btn-line" disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            style={{ opacity: step === 0 ? 0.35 : undefined }}>
            ← Retour
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
              style={{ opacity: canNext ? undefined : 0.4 }}>
              Continuer
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={finish}>
              Créer mon CV ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
