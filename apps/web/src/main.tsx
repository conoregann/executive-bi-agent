import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  InvestigationAnswer,
  CountryFollowUpAnswer,
  MrrDeclineApiResponse,
} from '@executive-bi/schemas';
import {
  readAnswer,
  startCountryFollowUp,
  readCountryFollowUpAnswer,
  readEvidence,
  startInvestigation,
  resolveQuestion,
} from './client.ts';
import './style.css';

type Claim =
  | InvestigationAnswer['answer']
  | InvestigationAnswer['drivers'][number]
  | InvestigationAnswer['context'][number];
function App() {
  const [followQuestion, setFollowQuestion] = useState('');
  const [followAnswer, setFollowAnswer] = useState<CountryFollowUpAnswer>();
  const [followMessage, setFollowMessage] = useState('');
  const followSession = useRef<{ id: string; token: string } | undefined>(
    undefined,
  );
  const [question, setQuestion] = useState('');
  const [resolution, setResolution] = useState('');
  const [resolving, setResolving] = useState(false);
  const [month, setMonth] = useState('2026-08');
  const [customers, setCustomers] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [record, setRecord] =
    useState<Extract<MrrDeclineApiResponse, { record: unknown }>['record']>();
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
    setFollowAnswer(undefined);
    setFollowMessage('');
    followSession.current = undefined;
    setRecord(undefined);
    setEvidence(undefined);
    setEvidenceError('');
    setEvidenceBusy(false);
    session.current = undefined;
    setMessage('Running the five-step MRR investigation…');
    try {
      const result = await startInvestigation(month, customers);
      setRecord(result.record);
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
  async function inspect(id: string, active = session.current) {
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
  async function followUp(question?: string) {
    const active = session.current;
    if (!active) return;
    setBusy(true);
    setFollowAnswer(undefined);
    followSession.current = undefined;
    setFollowMessage('Comparing country MRR against the previous month…');
    try {
      const result = await startCountryFollowUp(
        active.id,
        active.token,
        question,
      );
      followSession.current = {
        id: result.record.investigationId,
        token: result.accessToken,
      };
      if (result.status === 'blocked') {
        setFollowMessage(
          `Country follow-up blocked: required analytics are unavailable or do not reconcile. Retained record: ${result.record.investigationId}. ${result.warnings.join(' ')}`,
        );
      } else {
        setFollowAnswer(
          await readCountryFollowUpAnswer(
            result.record.investigationId,
            result.accessToken,
          ),
        );
        setFollowMessage('Country follow-up complete.');
      }
    } catch (error) {
      setFollowMessage(
        error instanceof Error ? error.message : 'Follow-up unavailable.',
      );
    } finally {
      setBusy(false);
    }
  }
  function claim(item: Claim, index = 0) {
    return (
      <div className="border-t border-[#e3eae6] py-3.5" key={index}>
        <small>{item.classification.replaceAll('_', ' ')}</small>
        <p>{item.text}</p>
        <div className="flex flex-wrap gap-2">
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
    <main className="mx-auto max-w-[1040px] px-3.5 py-6 min-[601px]:px-6 min-[601px]:py-12">
      <header className="pt-5 pb-9">
        <span className="text-[0.8rem] font-bold tracking-[0.15em]">
          NORTHSTAR / EXECUTIVE BI
        </span>
        <span className="mt-3 block w-fit rounded-full border border-[#657d75] px-3 py-[3px] text-[0.8rem] min-[601px]:ml-4 min-[601px]:mt-0 min-[601px]:inline-block">
          Synthetic data
        </span>
        <h1 className="mt-7 mb-[18px] max-w-[720px] text-[clamp(2rem,5vw,3.4rem)] leading-[1.15] font-bold">
          Understand your MRR movement.
        </h1>
        <p>
          Investigate a reporting month with trusted metrics and inspectable
          company evidence.
        </p>
      </header>
      <section
        className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6"
        aria-labelledby="request-heading"
      >
        <h2 id="request-heading">MRR investigation</h2>
        <label className="flex flex-col gap-2 font-semibold">
          Ask an MRR question
          <input
            value={question}
            maxLength={1000}
            disabled={busy || resolving}
            placeholder="Why did MRR fall in August 2026?"
            onChange={(event) => {
              setQuestion(event.target.value);
              setResolution('');
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || resolving}
          onClick={async () => {
            setResolving(true);
            setResolution('Resolving question…');
            try {
              const result = await resolveQuestion(question);
              if (result.status === 'resolved') {
                setMonth(result.month.slice(0, 7));
                setResolution(
                  `Resolved MRR investigation for ${result.month.slice(0, 7)}, compared with the previous month. Review the month and customer scope below, then select Investigate MRR.`,
                );
              } else setResolution(result.message);
            } catch (error) {
              setResolution(
                error instanceof Error
                  ? error.message
                  : 'Question resolution unavailable.',
              );
            } finally {
              setResolving(false);
            }
          }}
        >
          Resolve question
        </button>
        <p role="status" aria-live="polite">
          {resolution}
        </p>
        <form
          className="grid grid-cols-1 gap-4 min-[601px]:grid-cols-[1fr_2fr] [&>p]:col-span-full [&>p]:m-0 [&>p]:text-[0.9rem]"
          onSubmit={(event) => void submit(event)}
        >
          <label className="flex flex-col gap-2 font-semibold">
            Reporting month
            <input
              required
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              disabled={busy || resolving}
            />
          </label>
          <label className="flex flex-col gap-2 font-semibold">
            Customer IDs (optional)
            <input
              value={customers}
              onChange={(event) => setCustomers(event.target.value)}
              placeholder="cust_acme, cust_beta"
              aria-describedby="scope-help"
              disabled={busy || resolving}
            />
          </label>
          <p id="scope-help">
            Use comma-separated IDs to restrict this investigation. Leave blank
            for the full synthetic dataset. July and August 2026 are available;
            August supports comparison with July.
          </p>
          <button
            className="w-fit bg-[#174b3a] px-5 py-2.5 text-white"
            disabled={busy || resolving}
          >
            {busy ? 'Investigating…' : 'Investigate MRR'}
          </button>
        </form>
        <p role="status" aria-live="polite">
          {message}
        </p>
        <p className="text-[0.9rem] text-[#50645c]">
          Access is held only for this page session. Reloading clears the
          investigation token.
        </p>
      </section>
      {answer && (
        <article aria-label="Executive answer">
          <section className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6">
            <h2>Answer</h2>
            <p className="scope text-[0.9rem] text-[#50645c]">
              Reporting month: {answer.scope.month.slice(0, 7)} · Comparison:
              previous month · Customers:{' '}
              {answer.scope.permittedCustomerIds.join(', ') ||
                'Full synthetic dataset'}
            </p>
            {claim(answer.answer)}
          </section>
          <section className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6">
            <h2>Drivers</h2>
            {answer.drivers.length ? (
              answer.drivers.map(claim)
            ) : (
              <p>No negative customer movements were found.</p>
            )}
          </section>
          <section
            className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6"
            aria-labelledby="chart-heading"
          >
            <h2 id="chart-heading">MRR by plan</h2>
            {answer.chart ? (
              <>
                <p>
                  Month: {answer.chart.month.slice(0, 7)} · Customers:{' '}
                  {answer.chart.permittedCustomerIds.join(', ') ||
                    'Full synthetic dataset'}
                </p>
                <p>
                  {answer.chart.reconciles
                    ? 'Complete plan breakdown.'
                    : 'Incomplete breakdown: some MRR has no assigned plan.'}
                </p>
                <div aria-hidden="true" className="space-y-3">
                  {answer.chart.data.map((row) => (
                    <div key={row.dimensionValue}>
                      <div className="flex justify-between gap-3">
                        <span>{row.dimensionValue}</span>
                        <span>{eur(row.mrrEurCents)}</span>
                      </div>
                      <div className="h-5 rounded bg-[#edf2ef]">
                        <div
                          className="h-5 rounded bg-[#174b3a]"
                          style={{
                            width: `${(row.mrrEurCents / Math.max(1, ...answer.chart!.data.map((item) => item.mrrEurCents))) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <table className="my-4 w-full text-left">
                  <caption className="text-left font-semibold">
                    Plan MRR values (EUR)
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Plan</th>
                      <th scope="col">MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {answer.chart.data.map((row) => (
                      <tr key={row.dimensionValue}>
                        <th scope="row">{row.dimensionValue}</th>
                        <td>{eur(row.mrrEurCents)}</td>
                      </tr>
                    ))}
                    {!answer.chart.reconciles && (
                      <tr>
                        <th scope="row">Unassigned</th>
                        <td>{eur(answer.chart.unassignedMrrEurCents)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {!answer.chart.data.length && (
                  <p>No named plan MRR is available.</p>
                )}
                <button
                  type="button"
                  aria-controls="evidence-detail"
                  onClick={() => void inspect(answer.chart!.sourceEvidenceId)}
                >
                  Inspect chart evidence
                </button>
              </>
            ) : (
              <p>
                MRR by plan chart unavailable. Usable breakdown evidence is
                missing.
              </p>
            )}
          </section>
          <section className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6">
            <h2>Context</h2>
            {answer.context.length ? (
              answer.context.map(claim)
            ) : (
              <p>No scoped company context was retrieved.</p>
            )}
          </section>
          <section className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6">
            <h2>Limitations</h2>
            <ul>
              {answer.limitations.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </section>
          <section className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6">
            <h2>Evidence</h2>
            <ul className="list-disc pl-5 [&>li]:mb-3.5 [&_span]:block [&_span]:text-[0.85rem] [&_span]:[overflow-wrap:anywhere]">
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
          <section className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6">
            <h2>Recommended next step</h2>
            <p>{answer.recommendedNextStep.text}</p>
            <p>Owner: {answer.recommendedNextStep.owner}</p>
          </section>
          <section
            className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6"
            aria-labelledby="country-heading"
          >
            <h2 id="country-heading">Country comparison follow-up</h2>
            <p>
              Compare the same reporting months and customer scope as this
              investigation.
            </p>
            <button
              type="button"
              disabled={busy || resolving}
              onClick={() => void followUp()}
            >
              Break down by country
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void followUp(followQuestion);
              }}
            >
              <label className="flex flex-col gap-2 font-semibold">
                Follow-up question
                <input
                  value={followQuestion}
                  maxLength={1000}
                  disabled={busy || resolving}
                  placeholder="Break that down by country"
                  onChange={(event) => setFollowQuestion(event.target.value)}
                />
              </label>
              <button disabled={busy || resolving}>Run follow-up</button>
            </form>
            <p role="status" aria-live="polite">
              {followMessage}
            </p>
            {followAnswer && (
              <>
                <p>
                  Previous month:{' '}
                  {followAnswer.comparison.previousMonth.slice(0, 7)} · Current
                  month: {followAnswer.comparison.currentMonth.slice(0, 7)} ·
                  Customers:{' '}
                  {followAnswer.permittedCustomerIds.join(', ') ||
                    'Full synthetic dataset'}
                </p>
                <p>Ranked by signed MRR change, largest loss first.</p>
                <div aria-hidden="true" className="space-y-3">
                  {followAnswer.comparison.rows.map((row) => (
                    <div key={row.country ?? 'unassigned'}>
                      <div className="flex justify-between gap-3">
                        <span>{row.country ?? 'Unassigned country'}</span>
                        <span>{eur(row.mrrChangeEurCents)}</span>
                      </div>
                      <div className="h-5 rounded bg-[#edf2ef]">
                        <div
                          className={`h-5 rounded ${row.mrrChangeEurCents < 0 ? 'bg-[#a33b32]' : 'bg-[#174b3a]'}`}
                          style={{
                            width: `${(Math.abs(row.mrrChangeEurCents) / Math.max(1, ...followAnswer.comparison.rows.map((item) => Math.abs(item.mrrChangeEurCents)))) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="my-4 w-full text-left">
                    <caption className="text-left font-semibold">
                      Country MRR comparison (EUR)
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Country</th>
                        <th scope="col">Previous MRR</th>
                        <th scope="col">Current MRR</th>
                        <th scope="col">Change</th>
                        <th scope="col">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {followAnswer.comparison.rows.map((row) => (
                        <tr key={row.country ?? 'unassigned'}>
                          <th scope="row">
                            {row.country ?? 'Unassigned country'}
                          </th>
                          <td>{eur(row.previousMrrEurCents)}</td>
                          <td>{eur(row.currentMrrEurCents)}</td>
                          <td>{eur(row.mrrChangeEurCents)}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() =>
                                void inspect(
                                  followAnswer.sourceEvidenceIds[2]!,
                                  followSession.current,
                                )
                              }
                              aria-controls="evidence-detail"
                            >
                              Inspect country {row.country ?? 'unassigned'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        <td>
                          {eur(followAnswer.comparison.previousMrrEurCents)}
                        </td>
                        <td>
                          {eur(followAnswer.comparison.currentMrrEurCents)}
                        </td>
                        <td>
                          {eur(followAnswer.comparison.mrrChangeEurCents)}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              void inspect(
                                followAnswer.sourceEvidenceIds[2]!,
                                followSession.current,
                              )
                            }
                            aria-controls="evidence-detail"
                          >
                            Inspect country total
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <ul>
                  {followAnswer.limitations.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
                <p>
                  Stored follow-up: {followAnswer.investigationId} · Parent:{' '}
                  {followAnswer.parentInvestigationId}
                </p>
                <div className="flex flex-wrap gap-2">
                  {followAnswer.evidence.map((item) => (
                    <button
                      type="button"
                      key={item.evidenceId}
                      onClick={() =>
                        void inspect(item.evidenceId, followSession.current)
                      }
                      aria-controls="evidence-detail"
                    >
                      Inspect country evidence {item.evidenceId}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
          {record && (
            <details className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-6">
              <summary className="cursor-pointer font-semibold">
                How this answer was generated
              </summary>
              <p>
                Stored investigation: {record.investigationId} · Outcome:{' '}
                {record.status}
              </p>
              <p>Recorded plan in tool order.</p>
              <ol className="list-decimal pl-5">
                {record.plan.steps.map((step) => (
                  <li key={step}>{step.replaceAll('_', ' ')}</li>
                ))}
              </ol>
              <h3>Supporting cited evidence</h3>
              <ul>
                {answer.evidence.map((item) => (
                  <li key={item.evidenceId}>
                    <span className="[overflow-wrap:anywhere]">
                      {item.sourceRef} ·{' '}
                    </span>
                    <button
                      type="button"
                      aria-controls="evidence-detail"
                      onClick={() => void inspect(item.evidenceId)}
                    >
                      Inspect trail {item.evidenceId}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>
      )}
      <section
        className="mb-5 rounded-xl border border-[#d2ddd7] bg-white p-[18px] min-[601px]:p-6"
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
function eur(cents: number) {
  const digits = Math.abs(cents).toString().padStart(3, '0');
  return `EUR ${cents < 0 ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
createRoot(document.getElementById('root')!).render(<App />);
