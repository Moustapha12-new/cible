const COMPANIES = [
  "L'Oréal", "BNP Paribas", "Decathlon", "Capgemini", "Orange",
  "Airbus", "Danone", "Sephora", "SNCF", "Ubisoft", "Michelin", "Doctolib",
];

export default function LogoMarquee() {
  const row = [...COMPANIES, ...COMPANIES];
  return (
    <section aria-label="Entreprises où nos utilisateurs ont décroché des entretiens" className="relative py-14 overflow-clip">
      <p className="mono-label text-center mb-9" data-reveal>
        Ils ont décroché des entretiens chez
      </p>
      <div className="marquee-band py-5" data-reveal style={{ ["--rd" as string]: 1 }}>
        <div className="marquee">
          <div className="marquee-track">
            {row.map((c, i) => (
              <span key={i} className="marquee-item">
                {c}
                <span className="marquee-sep" aria-hidden="true">✦</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
