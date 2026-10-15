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
assert.ok(html.includes('class="cv-professional-layout"'));
assert.ok(!html.includes("cv-sidebar"), "tous les modèles gardent une colonne lisible");
assert.equal((html.match(/École · 2026/g) || []).length, 1);
const document = cvDocumentHtml(cv, DEFAULT_CV_DESIGN, "CV test");
assert.ok(document.includes("@page{size:A4;margin:0}"));
assert.ok(document.includes("print-color-adjust:exact"));
assert.ok(document.includes("cv-print-button"));
assert.ok(document.includes("button.disabled=!result.fits"));
assert.ok(document.includes("beforeprint"));
for (const template of ["professional", "grey", "design", "ats", "compact"] as const) assert.ok(cvBodyHtml(cv, { ...DEFAULT_CV_DESIGN, template }).includes('class="cv-professional-layout"'));
const parsed = parseCvText("Nom Prénom\nÉlève-ingénieur en énergie\nStage de fin d’études - six mois\nParis · Mobilité France\n(+33) 7 00 00 00 00 · mail@example.com\nPROFIL\nMon parcours et ma motivation.\nEXPÉRIENCE PROFESSIONNELLE\nEDD - Stage analyse énergétique\nNov. 2025 - Fév. 2026\n- Analysé des données\nOutils : Python\nPROJETS TECHNIQUES\nInstallation électrique\nProjet personnel\nDimensionnement des câbles.\nFORMATION\nDiplôme ingénieur\nCergy · 2024 - 2027");
assert.ok(parsed.basics.headline.includes("Élève-ingénieur"));
assert.ok(parsed.basics.contact.includes("mail@example.com"));
assert.ok(!parsed.summary.includes("mail@example.com"));
assert.match(parsed.summary, /Mon parcours et ma motivation/);
assert.ok(!parsed.sections.some(s => s.title === "PROFIL"), "profil intégré au résumé unique");
assert.ok(!parsed.sections.some(s => s.title === "Projet personnel"));
assert.equal(parsed.sections.find(s => s.title === "EXPÉRIENCE PROFESSIONNELLE")?.items.length, 1);
assert.ok(parsed.sections.find(s => s.title === "EXPÉRIENCE PROFESSIONNELLE")?.items[0].meta?.includes("Nov. 2025"));
const professional = cvBodyHtml({ ...cv, basics: { ...cv.basics, target: "Candidature — Stage électrique · SYSTRA" } }, DEFAULT_CV_DESIGN);
assert.equal(DEFAULT_CV_DESIGN.template, "professional");
for (const term of ["Projet électrique", "Football", "AutoCAD", "SYSTRA", "email@example.com"]) assert.ok(professional.includes(term));
assert.ok(professional.includes("cv-professional-header"));
assert.ok(professional.indexOf("AutoCAD") > professional.indexOf('class="cv-professional-layout"'));
assert.equal((professional.match(/Projet électrique/g) || []).length, 1);
assert.ok(!professional.includes("<script>"));
assert.ok(professional.includes('href="mailto:email@example.com"'));
assert.ok(document.includes("carlito-400.woff2"));
const wrapped = parseCvText("Nom Prénom\nÉlève-ingénieur en génie électrique\nStage ingénieur de fin d’études (PFE) · 6 mois à partir de février 2027 · Mobilité France\nParis | mail@example.com\nPROFIL\nExpérience en analyse\nde données.\nCOMPÉTENCES TECHNIQUES\nÉlectricité : réseaux BT, machines\nélectriques.\nFORMATION\nÉcole — Cycle ingénieur\nParis | 2024–2027\nÉlectrotechnique et réseaux.\nClasses préparatoires — MP\nLyon | 2022–2024\nMathématiques et physique.");
assert.equal(wrapped.basics.target?.includes("février 2027"), true);
assert.ok(!wrapped.basics.contact.includes("Stage ingénieur"));
assert.equal(wrapped.summary, "Expérience en analyse de données.");
assert.equal(wrapped.sections.find(s => /COMPÉTENCES/.test(s.title))?.text, "Électricité : réseaux BT, machines électriques.");
assert.equal(wrapped.sections.find(s => s.title === "FORMATION")?.items.length, 2);
const inlineEducation = parseCvText("Nom Prénom\nÉlève-ingénieur en électricité\nmail@example.com\nFORMATION\nÉcole A — Cycle ingénieur Cergy | 2024–2027\nÉlectrotechnique, réseaux électriques, automatique, systèmes embarqués.\nClasses préparatoires scientifiques — MP, option informatique Djibouti | 2022–2024\nMathématiques et physique.");
const educationItems = inlineEducation.sections.find(s => s.title === "FORMATION")?.items || [];
assert.equal(educationItems.length, 2, "deux formations distinctes avec dates sur la ligne du titre");
assert.ok(!educationItems[0].detail.includes("Classes préparatoires"));
assert.match(educationItems[1].detail, /Mathématiques/);
const target = parseCvText("Nom Prénom\nÉtudiant ingénieur\nCandidature — Stage électrique · SYSTRA\nmail@example.com\nCOMPÉTENCES\nPython");
assert.ok(target.basics.target?.includes("SYSTRA"));
console.log("Modèles CV vérifiés : contenu conservé, une colonne, sécurité HTML et export A4.");
