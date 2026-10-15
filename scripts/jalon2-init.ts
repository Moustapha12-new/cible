import fs from 'fs';
import path from 'path';

/**
 * jalon2-init.ts
 *
 * Small helper script to prepare the Jalon 2 worklist from the existing pilot
 * discovery report. It is intentionally a dry-run preparer: it does NOT call the
 * network or Supabase unless you explicitly enable it and provide credentials.
 *
 * Usage:
 *  - node --loader ts-node/esm scripts/jalon2-init.ts --dry-run  (default)
 *  - node --loader ts-node/esm scripts/jalon2-init.ts --run --confirm
 *
 * Safety: to perform network requests or write to Supabase the script requires
 * explicit --run and --confirm flags and environmental variables
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or a user key). This prevents
 * accidental re-execution of the 45 existing API calls.
 */

type PilotReport = {
  generatedAt: string;
  discovered: number;
  top10?: any[];
  runs?: any[];
};

const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.join(ROOT, 'scratch');
const PILOT = path.join(SCRATCH, 'pilot-discovery-report.json');
const WORKLIST = path.join(SCRATCH, 'jalon2-worklist.json');

function readPilot(): PilotReport | null {
  if (!fs.existsSync(PILOT)) return null;
  const raw = fs.readFileSync(PILOT, 'utf8');
  try {
    return JSON.parse(raw) as PilotReport;
  } catch (e) {
    console.error('pilot JSON parse failed', e);
    return null;
  }
}

function buildWorklist(report: PilotReport) {
  const work: any = { generatedAt: new Date().toISOString(), items: [] };

  const fromTop = (report.top10 || []).slice(0, 10).map((c: any) => ({
    siren: c.siren,
    name: c.name,
    commune: c.commune,
    naf: c.naf,
    tranche: c.tranche,
    website: c.website || null,
    websiteStatus: c.websiteStatus || 'none',
    reasons: c.reasons || [],
    missing: c.missing || [],
    priority: 'high',
    tasks: [
      'verify-siren',
      'find-official-site',
      'assess-domain',
      'find-career-page',
      'search-offers-on-site',
      'search-offers-on-web',
      'verify-offer-is-stage',
      'save-offer-if-valid',
    ],
  }));

  work.items.push(...fromTop);

  // If we still need items, create candidate placeholders (no API calls).
  const needed = Math.max(0, 25 - work.items.length);
  for (let i = 0; i < needed; i++) {
    work.items.push({
      placeholder: true,
      reason: 'candidate-from-pilot-runs',
      candidateIndex: i,
      tasks: [
        'resolve-company-from-siren-or-name',
        'find-official-site',
        'assess-domain',
        'find-career-page',
        'search-offers-on-site',
        'verify-offer-is-stage',
      ],
    });
  }

  return work;
}

function writeWorklist(work: any) {
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(WORKLIST, JSON.stringify(work, null, 2), 'utf8');
  console.log('Wrote', WORKLIST);
}

// Main
(function main() {
  const report = readPilot();
  if (!report) {
    console.error('pilot report not found at', PILOT);
    process.exit(1);
  }
  const work = buildWorklist(report);
  writeWorklist(work);
})();
