import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  CrossSourceAnswer,
  InvestigationAnswer,
  CountryFollowUpAnswer,
  CustomerFollowUpAnswer,
  ChurnFollowUpAnswer,
  MrrDeclineApiResponse,
} from '@executive-bi/schemas';
import {
  investigateCrossSource,
  startCustomerFollowUp,
  readCustomerFollowUpAnswer,
  readAnswer,
  startCountryFollowUp,
  startChurnFollowUp,
  readChurnFollowUpAnswer,
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
  const [requestOpen, setRequestOpen] = useState(true);
  const [churnAnswer, setChurnAnswer] = useState<ChurnFollowUpAnswer>();
  const [churnMessage, setChurnMessage] = useState('');
  const churnSession = useRef<{ id: string; token: string } | undefined>(
    undefined,
  );
  const [crossAnswer, setCrossAnswer] = useState<CrossSourceAnswer>();
  const [crossMessage, setCrossMessage] = useState('');
  const crossSession = useRef<{ id: string; token: string } | undefined>(
    undefined,
  );
  async function crossSource(question: string) {
    const active = customerSession.current ?? session.current;
    if (!active) return;
    setBusy(true);
    setCrossAnswer(undefined);
    setCrossMessage(
      'Validating retained revenue evidence, planning approved sources, then gathering scoped context…',
    );
    try {
      const result = await investigateCrossSource(
        active.id,
        active.token,
        question,
      );
      setCrossAnswer(result.answer);
      crossSession.current = result.session;
      setCrossMessage('Context investigation complete.');
    } catch (error) {
      setCrossMessage(
        error instanceof Error ? error.message : 'Context unavailable.',
      );
    } finally {
      setBusy(false);
    }
  }

  const [customerAnswer, setCustomerAnswer] =
    useState<CustomerFollowUpAnswer>();
  const [customerMessage, setCustomerMessage] = useState('');
  const customerSession = useRef<{ id: string; token: string } | undefined>(
    undefined,
  );
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
    setChurnAnswer(undefined);
    setChurnMessage('');
    churnSession.current = undefined;
    setCrossAnswer(undefined);
    setCrossMessage('');
    crossSession.current = undefined;
    setCustomerAnswer(undefined);
    setCustomerMessage('');
    customerSession.current = undefined;
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
      setMessage('');
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
    setCrossAnswer(undefined);
    setCrossMessage('');
    crossSession.current = undefined;
    setCustomerAnswer(undefined);
    setCustomerMessage('');
    customerSession.current = undefined;
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
  async function churnFollowUp() {
    const active = session.current;
    if (!active) return;
    setBusy(true);
    setChurnAnswer(undefined);
    setChurnMessage('Calculating customer churn from both monthly snapshots…');
    try {
      const result = await startChurnFollowUp(active.id, active.token);
      churnSession.current = {
        id: result.record.investigationId,
        token: result.accessToken,
      };
      if (result.status === 'blocked') {
        setChurnMessage(
          `Customer churn unavailable. Retained record: ${result.record.investigationId}. ${result.warnings.join(' ')}`,
        );
      } else {
        setChurnAnswer(
          await readChurnFollowUpAnswer(
            result.record.investigationId,
            result.accessToken,
          ),
        );
        setChurnMessage('Customer churn follow-up complete.');
      }
    } catch (error) {
      setChurnMessage(
        error instanceof Error ? error.message : 'Customer churn unavailable.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function showAccounts(country: string | null) {
    const active = followSession.current;
    if (!active) return;
    setBusy(true);
    setCrossAnswer(undefined);
    setCrossMessage('');
    crossSession.current = undefined;
    setCustomerAnswer(undefined);
    customerSession.current = undefined;
    setCustomerMessage(
      `Loading customer contributions for ${country ?? 'unassigned country'}…`,
    );
    try {
      const result = await startCustomerFollowUp(
        active.id,
        active.token,
        country,
      );
      customerSession.current = {
        id: result.record.investigationId,
        token: result.accessToken,
      };
      if (result.status === 'blocked') {
        setCustomerMessage(
          `Customer drill-down blocked: required evidence is unavailable or no longer matches the country comparison. Retained record: ${result.record.investigationId}. ${result.warnings.join(' ')}`,
        );
      } else {
        setCustomerAnswer(
          await readCustomerFollowUpAnswer(
            result.record.investigationId,
            result.accessToken,
          ),
        );
        setCustomerMessage('Customer drill-down complete.');
      }
    } catch (error) {
      setCustomerMessage(
        error instanceof Error
          ? error.message
          : 'Customer drill-down unavailable.',
      );
    } finally {
      setBusy(false);
    }
  }
  function claim(item: Claim, index = 0) {
    return (
      <div className="claim" key={index}>
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
    <main className="workspace" data-panel-open={requestOpen}>
      <header className="topbar">
        <button
          className="panel-toggle"
          type="button"
          aria-label={requestOpen ? 'Hide request panel' : 'Show request panel'}
          aria-controls="request-panel"
          aria-expanded={requestOpen}
          title={requestOpen ? 'Hide request panel' : 'Show request panel'}
          onClick={() => setRequestOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            {requestOpen && (
              <path className="panel-toggle-fill" d="M4 5h4v14H4z" />
            )}
          </svg>
        </button>
        <div className="topbar-title">
          <h1>MRR analysis</h1>
        </div>
      </header>
      <section
        className="request-panel"
        id="request-panel"
        aria-labelledby="request-heading"
        aria-hidden={!requestOpen}
        inert={!requestOpen}
      >
        <div className="panel-heading">
          <h2 id="request-heading">New investigation</h2>
        </div>
        <label className="field-label">
          Question <span className="optional">optional</span>
          <input
            value={question}
            maxLength={1000}
            disabled={busy || resolving}
            placeholder="Why did MRR fall?"
            onChange={(event) => {
              setQuestion(event.target.value);
              setResolution('');
            }}
          />
        </label>
        <button
          className="text-button resolve-button"
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
        {resolution && (
          <p className="inline-status" role="status" aria-live="polite">
            {resolution}
          </p>
        )}
        <form className="request-form" onSubmit={(event) => void submit(event)}>
          <label className="field-label">
            Reporting month
            <input
              required
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              disabled={busy || resolving}
            />
          </label>
          <label className="field-label">
            Customer IDs (optional)
            <input
              value={customers}
              onChange={(event) => setCustomers(event.target.value)}
              placeholder="cust_acme, cust_beta"
              aria-describedby="scope-help"
              disabled={busy || resolving}
            />
          </label>
          <p id="scope-help" className="field-help">
            Comma-separated IDs. Leave blank for all customers.
          </p>
          <button className="primary-button" disabled={busy || resolving}>
            {busy ? 'Investigating…' : 'Investigate MRR'}
          </button>
        </form>
        {message && (
          <p className="inline-status" role="status" aria-live="polite">
            {message}
          </p>
        )}
        <p className="panel-footnote">
          Available: July–August 2026. Access clears on reload.
        </p>
      </section>
      {!answer && !busy && !message && (
        <section className="empty-state" aria-label="Getting started">
          <h2>Start with a reporting month.</h2>
          <p>Results and supporting evidence will appear here.</p>
        </section>
      )}
      {answer && (
        <article className="results" aria-label="Executive answer">
          <section className="result-hero">
            <h2>Answer</h2>
            <p className="scope">
              Reporting month: {answer.scope.month.slice(0, 7)} · Comparison:
              previous month · Customers:{' '}
              {answer.scope.permittedCustomerIds.join(', ') || 'All customers'}
            </p>
            {claim(answer.answer)}
          </section>
          {answer.waterfall && (
            <section
              className="result-section waterfall-section"
              aria-labelledby="waterfall-heading"
            >
              <h2 id="waterfall-heading">Revenue movement waterfall</h2>
              <svg
                viewBox="0 0 720 300"
                role="img"
                aria-label="Reconciled MRR movement from previous to current month"
              >
                {answer.waterfall.data.map((row, index) => {
                  const max = Math.max(
                    1,
                    ...answer.waterfall!.data.flatMap((item) => [
                      item.startEurCents,
                      item.endEurCents,
                    ]),
                  );
                  const scale = 220 / max;
                  return (
                    <g key={row.label}>
                      <rect
                        x={index * 120 + 20}
                        y={
                          250 -
                          Math.max(row.startEurCents, row.endEurCents) * scale
                        }
                        width="70"
                        height={Math.max(
                          1,
                          Math.abs(row.endEurCents - row.startEurCents) * scale,
                        )}
                        fill={row.valueEurCents < 0 ? '#607751' : '#8a9e7c'}
                      />
                      <text
                        x={index * 120 + 55}
                        y="280"
                        textAnchor="middle"
                        fontSize="13"
                      >
                        {row.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Revenue movement values"
              >
                <table>
                  <caption>Deterministic revenue movement in EUR</caption>
                  <thead>
                    <tr>
                      <th scope="col">Movement</th>
                      <th scope="col">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {answer.waterfall.data.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>{eur(row.valueEurCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => void inspect(answer.waterfall!.sourceEvidenceId)}
              >
                Inspect waterfall evidence
              </button>
            </section>
          )}
          <div className="analysis-grid">
            <section className="result-section drivers-section">
              <h2>Drivers</h2>
              {answer.drivers.length ? (
                answer.drivers.map(claim)
              ) : (
                <p>No negative customer movements were found.</p>
              )}
            </section>
            <section
              className="result-section plan-section"
              aria-labelledby="chart-heading"
            >
              <h2 id="chart-heading">MRR by plan</h2>
              {answer.chart ? (
                <>
                  {!answer.chart.reconciles && (
                    <p className="data-note">
                      Incomplete breakdown · unassigned MRR shown below.
                    </p>
                  )}
                  <div aria-hidden="true" className="bar-list">
                    {answer.chart.data.map((row) => (
                      <div key={row.dimensionValue}>
                        <div className="flex justify-between gap-3">
                          <span>{row.dimensionValue}</span>
                          <span>{eur(row.mrrEurCents)}</span>
                        </div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${(row.mrrEurCents / Math.max(1, ...answer.chart!.data.map((item) => item.mrrEurCents))) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <table className="sr-only">
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
                    className="text-button"
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
          </div>
          <section className="result-section context-section">
            <h2>Context</h2>
            {answer.context.length ? (
              answer.context.map(claim)
            ) : (
              <p>No scoped company context was retrieved.</p>
            )}
          </section>
          <section className="result-section next-section">
            <h2>Recommended next step</h2>
            <p>{answer.recommendedNextStep.text}</p>
            <p className="meta-line">
              Owner: {answer.recommendedNextStep.owner}
            </p>
          </section>
          <details className="supporting-details">
            <summary>
              Sources & limitations{' '}
              <span>{answer.evidence.length} sources</span>
            </summary>
            <section className="supporting-section">
              <h2>Limitations</h2>
              <ul>
                {answer.limitations.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </section>
            <section className="supporting-section">
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
          </details>
          <section
            className="result-section follow-section"
            aria-labelledby="churn-heading"
            aria-busy={busy}
          >
            <h2 id="churn-heading">Customer churn rate</h2>
            <button
              type="button"
              disabled={busy || resolving}
              onClick={() => void churnFollowUp()}
            >
              Calculate customer churn
            </button>
            {churnMessage && (
              <p className="inline-status" role="status" aria-live="polite">
                {churnMessage}
              </p>
            )}
            {churnAnswer && (
              <>
                <p className="meta-line">
                  {churnAnswer.value.previousMonth.slice(0, 7)} to{' '}
                  {churnAnswer.value.currentMonth.slice(0, 7)} · Customers:{' '}
                  {churnAnswer.permittedCustomerIds.join(', ') ||
                    'All customers'}
                </p>
                <p>
                  {churnAnswer.value.churnedCustomers}{' '}
                  {churnAnswer.value.churnedCustomers === 1
                    ? 'customer'
                    : 'customers'}{' '}
                  churned / {churnAnswer.value.startingCustomers} starting
                  customers
                </p>
                <p>
                  {churnAnswer.value.rate === null
                    ? 'Rate unavailable: no starting customers.'
                    : `${(churnAnswer.value.rate * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}
                </p>
                <div className="source-actions">
                  {churnAnswer.sourceEvidenceIds.map((id) => (
                    <button
                      type="button"
                      key={id}
                      aria-controls="evidence-detail"
                      onClick={() => void inspect(id, churnSession.current)}
                    >
                      Inspect churn evidence {id}
                    </button>
                  ))}
                </div>
                {churnAnswer.warnings.map((warning) => (
                  <p className="data-note" key={warning}>
                    {warning}
                  </p>
                ))}
              </>
            )}
          </section>
          <section
            className="result-section follow-section"
            aria-labelledby="country-heading"
          >
            <h2 id="country-heading">Country comparison</h2>
            <button
              type="button"
              disabled={busy || resolving}
              onClick={() => void followUp()}
            >
              Break down by country
            </button>
            <details className="phrase-details">
              <summary>Use a follow-up question</summary>
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
            </details>
            {followMessage && (
              <p className="inline-status" role="status" aria-live="polite">
                {followMessage}
              </p>
            )}
            {followAnswer && (
              <>
                <p className="meta-line">
                  Previous month:{' '}
                  {followAnswer.comparison.previousMonth.slice(0, 7)} · Current
                  month: {followAnswer.comparison.currentMonth.slice(0, 7)} ·
                  Customers:{' '}
                  {followAnswer.permittedCustomerIds.join(', ') ||
                    'All customers'}
                </p>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Country comparison table"
                >
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
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void showAccounts(row.country)}
                              aria-label={`Show accounts for ${row.country ?? 'unassigned country'}`}
                              aria-controls="customer-drilldown"
                            >
                              Show accounts
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
                <details className="supporting-details nested-details">
                  <summary>Country sources</summary>
                  <div className="source-actions">
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
                </details>
              </>
            )}
          </section>
          {(followAnswer || customerMessage || customerAnswer) && (
            <section
              id="customer-drilldown"
              aria-labelledby="customer-heading"
              aria-busy={busy}
              className="result-section customer-section"
            >
              <h2 id="customer-heading">Customer contributions</h2>
              <p role="status" aria-live="polite">
                {customerMessage}
              </p>
              {customerAnswer && (
                <>
                  <h3>
                    {customerAnswer.contributions.country ??
                      'Unassigned country'}{' '}
                    · {customerAnswer.contributions.previousMonth.slice(0, 7)} →{' '}
                    {customerAnswer.contributions.currentMonth.slice(0, 7)}
                  </h3>
                  <div
                    className="overflow-x-auto"
                    tabIndex={0}
                    role="region"
                    aria-label="Customer contributions table"
                  >
                    <table className="my-4 w-full min-w-[620px] text-left">
                      <caption className="text-left font-semibold">
                        Five largest negative customer contributions (EUR)
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Customer</th>
                          <th scope="col">Previous MRR</th>
                          <th scope="col">Current MRR</th>
                          <th scope="col">Contribution</th>
                          <th scope="col">Evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerAnswer.contributions.largestLosses.map(
                          (row) => (
                            <tr key={row.customerId}>
                              <th scope="row">{row.customerId}</th>
                              <td>{eur(row.previousMrrEurCents)}</td>
                              <td>{eur(row.currentMrrEurCents)}</td>
                              <td>{eur(row.mrrChangeEurCents)}</td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void inspect(
                                      customerAnswer.sourceEvidenceIds[2]!,
                                      customerSession.current,
                                    )
                                  }
                                  aria-controls="evidence-detail"
                                >
                                  Inspect contribution {row.customerId}
                                </button>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                  {customerAnswer.contributions.largestLosses.length === 0 && (
                    <p>No negative customer contributions in this country.</p>
                  )}
                  <dl>
                    <dt>Positive offsets</dt>
                    <dd>
                      {eur(
                        customerAnswer.contributions.positiveOffsetsEurCents,
                      )}
                    </dd>
                    <dt>Remaining net movement</dt>
                    <dd>
                      {eur(
                        customerAnswer.contributions
                          .remainingNetMovementEurCents,
                      )}
                    </dd>
                    <dt>Country MRR: previous → current</dt>
                    <dd>
                      {eur(customerAnswer.contributions.previousMrrEurCents)} →{' '}
                      {eur(customerAnswer.contributions.currentMrrEurCents)}
                    </dd>
                    <dt>Country net movement</dt>
                    <dd>
                      {eur(customerAnswer.contributions.mrrChangeEurCents)}
                    </dd>
                  </dl>
                  <button
                    type="button"
                    onClick={() =>
                      void inspect(
                        customerAnswer.sourceEvidenceIds[2]!,
                        customerSession.current,
                      )
                    }
                    aria-controls="evidence-detail"
                  >
                    Inspect offsets, remainder and country totals
                  </button>
                  <ul>
                    {customerAnswer.limitations.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                  <details className="supporting-details nested-details">
                    <summary>Customer sources</summary>
                    <div className="source-actions">
                      {customerAnswer.sourceEvidenceIds.map((id) => (
                        <button
                          type="button"
                          key={id}
                          onClick={() =>
                            void inspect(id, customerSession.current)
                          }
                          aria-controls="evidence-detail"
                        >
                          Inspect customer evidence {id}
                        </button>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </section>
          )}
          <section
            className="result-section cross-section"
            aria-label="Cross-source revenue investigation"
            aria-busy={busy}
          >
            <h2>Cross-source revenue investigation</h2>
            <div className="source-actions">
              {[
                'Investigate revenue losses across sources',
                'Did those accounts have support escalations or declining usage?',
                'What evidence supports a pricing-related explanation?',
              ].map((text) => (
                <button
                  key={text}
                  type="button"
                  disabled={busy}
                  onClick={() => void crossSource(text)}
                >
                  {text}
                </button>
              ))}
            </div>
            {crossMessage && (
              <p className="inline-status" role="status" aria-live="polite">
                {crossMessage}
              </p>
            )}
            {crossAnswer && (
              <div className="cross-results">
                <p className="meta-line">
                  Accounts:{' '}
                  {crossAnswer.record.customerIds.join(', ') ||
                    'No retained losses'}
                </p>
                <p className="meta-line">
                  Approved plan: {crossAnswer.record.plan.steps.join(' → ')} ·
                  Planner: {crossAnswer.record.plan.planner} · Model synthesis:{' '}
                  {crossAnswer.record.modelStatus}
                </p>
                {crossAnswer.evidence
                  .filter(
                    (item) => item.source === 'synthetic_operational_records',
                  )
                  .map((item) => (
                    <div className="cross-source" key={item.evidenceId}>
                      <h3>{String(item.scope.source)} evidence</h3>
                      <p className="meta-line">
                        Freshness: {item.freshness} · Missing coverage:{' '}
                        {Array.isArray(item.content.missingCustomerIds)
                          ? item.content.missingCustomerIds.join(', ') || 'None'
                          : 'Unavailable'}{' '}
                        · Stale coverage:{' '}
                        {Array.isArray(item.content.staleCustomerIds)
                          ? item.content.staleCustomerIds.join(', ') || 'None'
                          : 'Unavailable'}
                      </p>
                      <div
                        className="table-scroll"
                        tabIndex={0}
                        role="region"
                        aria-label={`${String(item.scope.source)} records`}
                      >
                        <table>
                          <caption>Observed operational records</caption>
                          <thead>
                            <tr>
                              <th scope="col">Account</th>
                              <th scope="col">Month</th>
                              <th scope="col">Category</th>
                              <th scope="col">Active users</th>
                              <th scope="col">Source excerpt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.isArray(item.content.rows) &&
                              item.content.rows.map((row) => (
                                <tr key={row.recordId}>
                                  <td>{row.customerId}</td>
                                  <td>{row.month}</td>
                                  <td>{row.category}</td>
                                  <td>{row.activeUsers ?? 'Not applicable'}</td>
                                  <td>{row.note}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {Array.isArray(item.content.usageComparisons) && (
                        <ul>
                          {item.content.usageComparisons.map((row) => (
                            <li key={row.customerId}>
                              {row.customerId}: active users{' '}
                              {row.previousActiveUsers ?? 'Missing'} →{' '}
                              {row.currentActiveUsers ?? 'Missing'}, change{' '}
                              {row.activeUserChange ?? 'Unavailable'}.
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void inspect(item.evidenceId, crossSession.current)
                        }
                      >
                        Inspect {String(item.scope.source)} query evidence
                      </button>
                    </div>
                  ))}
                {crossAnswer.evidence
                  .filter((item) => item.type === 'document_chunk')
                  .map((item) => (
                    <div className="cross-source" key={item.evidenceId}>
                      <h3>Document context</h3>
                      <blockquote>
                        {String(item.content.excerpt ?? '')}
                      </blockquote>
                      <button
                        type="button"
                        onClick={() =>
                          void inspect(item.evidenceId, crossSession.current)
                        }
                      >
                        Inspect document {item.sourceRef}
                      </button>
                    </div>
                  ))}
                <div className="cross-source">
                  <h3>Tentative hypotheses</h3>
                  {crossAnswer.record.hypotheses.length === 0 && (
                    <p>
                      No validated model explanation is available. Review the
                      observed records and document excerpts.
                    </p>
                  )}
                  {crossAnswer.record.hypotheses.map((hypothesis, index) => (
                    <div key={index}>
                      <p>
                        {hypothesis.kind} may be relevant to the retained
                        losses; causality is unconfirmed.
                      </p>
                      <p>Supporting references:</p>
                      {hypothesis.supportingEvidenceIds.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => void inspect(id, crossSession.current)}
                        >
                          {id}
                        </button>
                      ))}
                      <p>Contradictory references:</p>
                      {hypothesis.contradictoryEvidenceIds.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => void inspect(id, crossSession.current)}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="cross-source">
                  <h3>Coverage and limitations</h3>
                  <ul>
                    {crossAnswer.record.warnings.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() =>
                      void inspect('cross_parent', crossSession.current)
                    }
                  >
                    Inspect retained revenue and parent provenance
                  </button>
                </div>
              </div>
            )}
          </section>
          {record && (
            <details className="supporting-details trail-details">
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
      {(evidence || evidenceBusy || evidenceError) && (
        <section
          className="evidence-panel"
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
      )}
    </main>
  );
}
function eur(cents: number) {
  const digits = Math.abs(cents).toString().padStart(3, '0');
  return `EUR ${cents < 0 ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
createRoot(document.getElementById('root')!).render(<App />);
