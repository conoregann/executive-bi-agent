import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { InvestigationAnswer } from '@executive-bi/schemas';
import { readAnswer, readEvidence, startInvestigation } from './client.ts';
import './style.css';

type Claim =
  | InvestigationAnswer['answer']
  | InvestigationAnswer['drivers'][number]
  | InvestigationAnswer['context'][number];
function App() {
  const [month, setMonth] = useState('2026-08');
  const [customers, setCustomers] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState<InvestigationAnswer>();
  const [evidence, setEvidence] =
    useState<Awaited<ReturnType<typeof readEvidence>>>();
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const session = useRef<{ id: string; token: string } | undefined>(undefined);
  const evidenceRequest = useRef(0);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (evidence || evidenceError) evidenceHeading.current?.focus();
  }, [evidence, evidenceError]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    evidenceRequest.current++;
    setBusy(true);
    setAnswer(undefined);
    setEvidence(undefined);
    setEvidenceError('');
    setEvidenceBusy(false);
    session.current = undefined;
    setMessage('Running the five-step MRR investigation…');
    try {
      const result = await startInvestigation(month, customers);
      session.current = {
        id: result.record.investigationId,
        token: result.accessToken,
      };
      if (result.status === 'blocked') {
        setMessage(
          `Investigation blocked: ${result.error ?? 'Required evidence is unavailable.'} ${result.warnings.join(' ')}`,
        );
        return;
      }
      setAnswer(
        await readAnswer(result.record.investigationId, result.accessToken),
      );
      setMessage('Investigation complete.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Investigation service unavailable. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function inspect(id: string) {
    const active = session.current;
    if (!active) return;
    const version = ++evidenceRequest.current;
    setEvidence(undefined);
    setEvidenceError('');
    setEvidenceBusy(true);
    try {
      const item = await readEvidence(active.id, active.token, id);
      if (version === evidenceRequest.current) setEvidence(item);
    } catch {
      if (version === evidenceRequest.current)
        setEvidenceError(
          'Evidence unavailable. Try opening the citation again.',
        );
    } finally {
      if (version === evidenceRequest.current) setEvidenceBusy(false);
    }
  }
  function claim(item: Claim, index = 0) {
    return (
      <div className="claim" key={index}>
        <small>{item.classification.replaceAll('_', ' ')}</small>
        <p>{item.text}</p>
        <div className="citations">
          {item.evidenceIds.map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => void inspect(id)}
              aria-controls="evidence-detail"
            >
              Inspect {id}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <main>
      <header>
        <span className="brand">NORTHSTAR / EXECUTIVE BI</span>
        <span className="badge">Synthetic data</span>
        <h1>Understand your MRR movement.</h1>
        <p>
          Investigate a reporting month with trusted metrics and inspectable
          company evidence.
        </p>
      </header>
      <section aria-labelledby="request-heading">
        <h2 id="request-heading">MRR investigation</h2>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Reporting month
            <input
              required
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Customer IDs (optional)
            <input
              value={customers}
              onChange={(event) => setCustomers(event.target.value)}
              placeholder="cust_acme, cust_beta"
              aria-describedby="scope-help"
              disabled={busy}
            />
          </label>
          <p id="scope-help">
            Use comma-separated IDs to restrict this investigation. Leave blank
            for the full synthetic dataset. July and August 2026 are available;
            August supports comparison with July.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? 'Investigating…' : 'Investigate MRR'}
          </button>
        </form>
        <p role="status" aria-live="polite">
          {message}
        </p>
        <p className="muted">
          Access is held only for this page session. Reloading clears the
          investigation token.
        </p>
      </section>
      {answer && (
        <article aria-label="Executive answer">
          <section>
            <h2>Answer</h2>
            <p className="scope">
              Reporting month: {answer.scope.month.slice(0, 7)} · Comparison:
              previous month · Customers:{' '}
              {answer.scope.permittedCustomerIds.join(', ') ||
                'Full synthetic dataset'}
            </p>
            {claim(answer.answer)}
          </section>
          <section>
            <h2>Drivers</h2>
            {answer.drivers.length ? (
              answer.drivers.map(claim)
            ) : (
              <p>No negative customer movements were found.</p>
            )}
          </section>
          <section>
            <h2>Context</h2>
            {answer.context.length ? (
              answer.context.map(claim)
            ) : (
              <p>No scoped company context was retrieved.</p>
            )}
          </section>
          <section>
            <h2>Limitations</h2>
            <ul>
              {answer.limitations.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Evidence</h2>
            <ul className="evidence-list">
              {answer.evidence.map((item) => (
                <li key={item.evidenceId}>
                  <button
                    type="button"
                    onClick={() => void inspect(item.evidenceId)}
                    aria-controls="evidence-detail"
                  >
                    Inspect {item.evidenceId}
                  </button>
                  <span>
                    {item.type.replaceAll('_', ' ')} · {item.sourceRef} ·
                    Freshness: {item.freshness}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Recommended next step</h2>
            <p>{answer.recommendedNextStep.text}</p>
            <p>Owner: {answer.recommendedNextStep.owner}</p>
          </section>
        </article>
      )}
      <section
        id="evidence-detail"
        aria-labelledby="evidence-heading"
        aria-busy={evidenceBusy}
      >
        <h2 id="evidence-heading" ref={evidenceHeading} tabIndex={-1}>
          Evidence detail
        </h2>
        <p role="status">
          {evidenceBusy ? 'Loading protected evidence…' : evidenceError}
        </p>
        {evidence ? (
          <>
            <h3>{evidence.sourceRef}</h3>
            <dl>
              <dt>Evidence ID</dt>
              <dd>{evidence.evidenceId}</dd>
              <dt>Source</dt>
              <dd>{evidence.source}</dd>
              <dt>Freshness</dt>
              <dd>{evidence.freshness}</dd>
              <dt>Integrity</dt>
              <dd>{evidence.integrity}</dd>
            </dl>
            <h3>Scope</h3>
            <pre>{JSON.stringify(evidence.scope, null, 2)}</pre>
            <h3>Supporting values or document excerpt</h3>
            <pre>{JSON.stringify(evidence.content, null, 2)}</pre>
          </>
        ) : (
          !evidenceBusy &&
          !evidenceError && (
            <p>Open a citation to inspect its supporting evidence.</p>
          )
        )}
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
