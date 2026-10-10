import assert from "node:assert/strict";
import { cvBodyHtml, cvDocumentHtml, parseCvText, DEFAULT_CV_DESIGN, type CvData } from "./cv";

const cv: CvData = {
  basics: { name: "Nom <script>alert(1)</script>", headline: "Stage ingénieur", contact: "email@example.com\nParis" },
  summary: "Un profil réel",
  sections: [
    { key: "work", title: "Expériences", kind: "list", text: "", items: [{ id: "1", title: "Projet électrique", meta: "École · 2026", detail: "- Conception\n- Dimensionnement" }] },
    { key: "interests", title: "Centres d’intérêt", kind: "text", text: "Football", items: [] },
    { key: "skills", title: "Compétences", kind: "text", text: "AutoCAD", items: [] },
  ],
};
const html = cvBodyHtml(cv, { ...DEFAULT_CV_DESIGN, template: "grey" });
assert.ok(!html.includes("<script>"));
for (const term of ["Projet électrique", "École · 2026", "Conception", "Dimensionnement", "Football", "AutoCAD", "email@example.com", "Paris"]) assert.ok(html.includes(term), `Contenu conservé : ${term}`);
assert.ok(html.indexOf("Football") < html.indexOf('<main class="cv-main">'));
assert.ok(html.indexOf("Projet électrique") > html.indexOf('<main class="cv-main">'));
assert.equal((html.match(/École · 2026/g) || []).length, 1);
const document = cvDocumentHtml(cv, DEFAULT_CV_DESIGN, "CV test");
assert.ok(document.includes("@page{size:A4;margin:0}"));
assert.ok(document.includes("print-color-adjust:exact"));
assert.ok(document.includes("cv-print-button"));
assert.ok(document.includes("button.disabled=!result.fits"));
assert.ok(document.includes("beforeprint"));
assert.ok(!cvBodyHtml(cv, { ...DEFAULT_CV_DESIGN, template: "ats" }).includes("cv-grey-layout"));
const parsed = parseCvText("Nom Prénom\nÉlève-ingénieur en énergie\nStage de fin d’études - six mois\nParis · Mobilité France\n(+33) 7 00 00 00 00 · mail@example.com\nPROFIL\nMon parcours et ma motivation.\nEXPÉRIENCE PROFESSIONNELLE\nEDD - Stage analyse énergétique\nNov. 2025 - Fév. 2026\n- Analysé des données\nOutils : Python\nPROJETS TECHNIQUES\nInstallation électrique\nProjet personnel\nDimensionnement des câbles.\nFORMATION\nDiplôme ingénieur\nCergy · 2024 - 2027");
assert.ok(parsed.basics.headline.includes("Élève-ingénieur"));
assert.ok(parsed.basics.contact.includes("mail@example.com"));
assert.ok(!parsed.summary.includes("mail@example.com"));
assert.equal(parsed.sections.find(s => s.title === "PROFIL")?.kind, "text");
assert.ok(!parsed.sections.some(s => s.title === "Projet personnel"));
assert.equal(parsed.sections.find(s => s.title === "EXPÉRIENCE PROFESSIONNELLE")?.items.length, 1);
assert.ok(parsed.sections.find(s => s.title === "EXPÉRIENCE PROFESSIONNELLE")?.items[0].meta?.includes("Nov. 2025"));
const professional = cvBodyHtml({ ...cv, basics: { ...cv.basics, target: "Candidature — Stage électrique · SYSTRA" } }, DEFAULT_CV_DESIGN);
assert.equal(DEFAULT_CV_DESIGN.template, "professional");
for (const term of ["Projet électrique", "Football", "AutoCAD", "SYSTRA", "email@example.com"]) assert.ok(professional.includes(term));
assert.ok(professional.includes("cv-professional-header"));
assert.ok(professional.indexOf("AutoCAD") < professional.indexOf('class="cv-professional-main"'));
assert.equal((professional.match(/Projet électrique/g) || []).length, 1);
assert.ok(!professional.includes("<script>"));
const target = parseCvText("Nom Prénom\nÉtudiant ingénieur\nCandidature — Stage électrique · SYSTRA\nmail@example.com\nCOMPÉTENCES\nPython");
assert.ok(target.basics.target?.includes("SYSTRA"));
console.log("Modèle CV vérifié : contenu conservé, colonnes, sécurité HTML et export A4.");
