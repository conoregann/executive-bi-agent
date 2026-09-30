import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
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
  login,
  signOut,
} from './client.ts';
import './style.css';
import { MarkdownContent } from './markdown.tsx';

type Claim =
  | InvestigationAnswer['answer']
  | InvestigationAnswer['drivers'][number]
  | InvestigationAnswer['context'][number];

function CopyMarkdownButton({ text }: { text: string }) {
  const [status, setStatus] = useState<'copied' | 'failed' | ''>('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copyMarkdown() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    timer.current = setTimeout(() => setStatus(''), 2000);
  }

  return (
    <span className="copy-markdown-wrap">
      <button
        className="copy-markdown"
        type="button"
        aria-label="Copy source as Markdown"
        title={status === 'copied' ? 'Copied Markdown' : 'Copy Markdown'}
        onClick={() => void copyMarkdown()}
      >
        {status === 'copied' ? (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m4 10 4 4 8-8" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="7" y="6" width="9" height="11" rx="1.5" />
            <path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-6A1.5 1.5 0 0 0 3 4.5v8A1.5 1.5 0 0 0 4.5 14H7" />
          </svg>
        )}
      </button>
      <span className="copy-feedback" role="status" aria-live="polite">
        {status === 'copied'
          ? 'Copied'
          : status === 'failed'
            ? 'Copy failed'
            : ''}
      </span>
    </span>
  );
}

function EvidenceLinks({ children }: { children: ReactNode }) {
  return (
    <details className="citation-details">
      <summary>Sources</summary>
      <div className="citation-links">{children}</div>
    </details>
  );
}

type Session = { id: string; token: string };
type HistoryEntry = {
  record: Extract<MrrDeclineApiResponse, { record: unknown }>['record'];
  answer: InvestigationAnswer;
  session: Session;
  customers: string;
  churnAnswer?: ChurnFollowUpAnswer;
  churnSession?: Session;
  followAnswer?: CountryFollowUpAnswer;
  followSession?: Session;
  customerAnswer?: CustomerFollowUpAnswer;
  customerSession?: Session;
  crossAnswer?: CrossSourceAnswer;
  crossSession?: Session;
};

function monthLabel(value: string) {
  return new Date(value.slice(0, 7) + '-01T12:00:00Z').toLocaleDateString(
    'en',
    {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    },
  );
}

function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
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
  const [followAnswer, setFollowAnswer] = useState<CountryFollowUpAnswer>();
  const [followMessage, setFollowMessage] = useState('');
  const followSession = useRef<{ id: string; token: string } | undefined>(
    undefined,
  );
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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  useEffect(() => {
    if (busy || !record || !answer || !session.current) return;
    const entry: HistoryEntry = {
      record,
      answer,
      session: session.current,
      customers: answer.scope.permittedCustomerIds.join(', '),
      churnAnswer,
      churnSession: churnSession.current,
      followAnswer,
      followSession: followSession.current,
      customerAnswer,
      customerSession: customerSession.current,
      crossAnswer,
      crossSession: crossSession.current,
    };
    setHistory((previous) =>
      [
        entry,
        ...previous.filter((item) => item.session.id !== entry.session.id),
      ].slice(0, 20),
    );
  }, [
    busy,
    record,
    answer,
    churnAnswer,
    followAnswer,
    customerAnswer,
    crossAnswer,
  ]);

  function reopen(entry: HistoryEntry) {
    evidenceRequest.current++;
    setEvidence(undefined);
    setEvidenceError('');
    setEvidenceBusy(false);
    setRecord(entry.record);
    setAnswer(entry.answer);
    session.current = entry.session;
    setMonth(entry.answer.scope.month.slice(0, 7));
    setCustomers(entry.customers);
    setChurnAnswer(entry.churnAnswer);
    churnSession.current = entry.churnSession;
    setFollowAnswer(entry.followAnswer);
    followSession.current = entry.followSession;
    setCustomerAnswer(entry.customerAnswer);
    customerSession.current = entry.customerSession;
    setCrossAnswer(entry.crossAnswer);
    crossSession.current = entry.crossSession;
    setMessage('');
    setChurnMessage('');
    setFollowMessage('');
    setCustomerMessage('');
    setCrossMessage('');
  }

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
        <EvidenceLinks>
          {item.evidenceIds.map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => void inspect(id)}
              aria-controls="evidence-detail"
            >
              {citationLabel(id)}
            </button>
          ))}
        </EvidenceLinks>
      </div>
    );
  }
  function citationLabel(id: string) {
    const item = answer?.evidence.find(
      (evidenceItem) => evidenceItem.evidenceId === id,
    );
    if (!item) return 'Inspect evidence';
    if (item.type === 'metric_query') {
      const ref = item.sourceRef;
      if (ref.startsWith('mrr_movement:')) {
        return `Inspect customer MRR movements · ${ref.split(':')[1] ?? ''}`;
      }
      const period = /mrr:(\d{4}-\d{2})/.exec(ref)?.[1];
      if (ref.includes(':by:plan'))
        return `Inspect MRR by plan${period ? ` · ${period}` : ''}`;
      if (ref.startsWith('mrr:'))
        return `Inspect total MRR${period ? ` · ${period}` : ''}`;
      return 'Inspect metric query';
    }
    if (item.type === 'document_chunk')
      return `Inspect source excerpt · ${item.sourceRef}`;
    if (item.type === 'calculation') {
      return item.sourceRef === 'mrr_calculation'
        ? 'Inspect month comparison calculation'
        : 'Inspect revenue movement reconciliation';
    }
    return 'Inspect evidence';
  }
  if (!signedIn)
    return (
      <main className="signin-page">
        <form
          className="signin-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setLoginError('');
            try {
              await login(username, password);
              setPassword('');
              setSignedIn(true);
            } catch (error) {
              setLoginError(
                error instanceof Error ? error.message : 'Sign in failed.',
              );
            }
          }}
        >
          <h1>MRR analysis</h1>
          <p>Sign in to investigate your customer scope.</p>
          <label className="field-label">
            Username
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="field-label">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="primary-button">Sign in</button>
          {loginError && <p role="alert">{loginError}</p>}
        </form>
      </main>
    );
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
        <button
          type="button"
          className="signout-button"
          onClick={() => {
            signOut();
            setHistory([]);
            setHistorySearch('');
            setSignedIn(false);
            setAnswer(undefined);
            setRecord(undefined);
            setEvidence(undefined);
            setChurnAnswer(undefined);
            setFollowAnswer(undefined);
            setCustomerAnswer(undefined);
            setCrossAnswer(undefined);
            setMessage('');
            setFollowMessage('');
            setCustomerMessage('');
            setCrossMessage('');
            setChurnMessage('');
            session.current = undefined;
            followSession.current = undefined;
            customerSession.current = undefined;
            crossSession.current = undefined;
            churnSession.current = undefined;
            evidenceRequest.current += 1;
          }}
        >
          Sign out
        </button>
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
        <form className="request-form" onSubmit={(event) => void submit(event)}>
          <label className="field-label">
            Reporting month
            <input
              required
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field-label">
            Customer IDs (optional)
            <input
              value={customers}
              onChange={(event) => setCustomers(event.target.value)}
              placeholder="cust_acme, cust_beta"
              aria-describedby="scope-help"
              disabled={busy}
            />
          </label>
          <p id="scope-help" className="field-help">
            Comma-separated IDs. Leave blank for all customers in your access
            scope.
          </p>
          <button className="primary-button" disabled={busy}>
            {busy ? 'Investigating…' : 'Investigate MRR'}
          </button>
        </form>
        {message && (
          <p className="inline-status" role="status" aria-live="polite">
            {message}
          </p>
        )}
        <p className="panel-footnote">Available: July–August 2026.</p>
        <nav className="history-panel" aria-label="Recent investigations">
          <h2>Recent investigations</h2>
          <p className="field-help">
            This session · clears on reload or sign-out
          </p>
          {history.length > 0 && (
            <input
              type="search"
              aria-label="Search investigations"
              placeholder="Search history"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
            />
          )}
          {history.length === 0 && (
            <p className="field-help">Your investigations will appear here.</p>
          )}
          {history
            .filter((entry) =>
              (
                monthLabel(entry.answer.scope.month) +
                ' ' +
                (entry.customers || 'All customers')
              )
                .toLowerCase()
                .includes(historySearch.toLowerCase()),
            )
            .map((entry) => (
              <button
                type="button"
                key={entry.session.id}
                disabled={busy}
                aria-current={
                  record?.investigationId === entry.session.id
                    ? 'page'
                    : undefined
                }
                onClick={() => reopen(entry)}
              >
                <span>{monthLabel(entry.answer.scope.month)}</span>
                <small>{entry.customers || 'All customers'}</small>
              </button>
            ))}
          {history.length > 0 &&
            !history.some((entry) =>
              (
                monthLabel(entry.answer.scope.month) +
                ' ' +
                (entry.customers || 'All customers')
              )
                .toLowerCase()
                .includes(historySearch.toLowerCase()),
            ) && <p className="field-help">No matching investigations.</p>}
        </nav>
      </section>
      {!answer && !busy && !message && (
        <section className="empty-state" aria-label="Getting started">
          <h2>Start with a reporting month.</h2>
          <p>Results and supporting evidence will appear here.</p>
        </section>
      )}
      {answer && (
        <article
          key={record?.investigationId}
          className="results"
          aria-label="Executive answer"
        >
          <section className="result-hero">
            <h2>Answer</h2>
            <dl className="scope">
              <div>
                <dt>Reporting month</dt>
                <dd>{monthLabel(answer.scope.month)}</dd>
              </div>
              <div>
                <dt>Comparison</dt>
                <dd>Previous month</dd>
              </div>
              <div>
                <dt>Customers</dt>
                <dd>
                  {answer.scope.permittedCustomerIds.join(', ') ||
                    'All customers'}
                </dd>
              </div>
            </dl>
            {claim(answer.answer)}
          </section>
          {answer.waterfall && (
            <section
              className="result-section waterfall-section"
              aria-labelledby="waterfall-heading"
            >
              <h2 id="waterfall-heading">Revenue movement waterfall</h2>
              <p className="chart-caption">
                Monthly MRR bridge · values in EUR · bars show the change from
                each step’s starting balance.
              </p>
              <div
                className="waterfall-chart-scroll"
                role="region"
                aria-label="Revenue movement chart"
                tabIndex={0}
              >
                <svg
                  viewBox="0 0 900 390"
                  role="img"
                  aria-label={`MRR movement from ${eur(answer.waterfall.data[0]?.startEurCents ?? 0)} to ${eur(answer.waterfall.data.at(-1)?.endEurCents ?? 0)}`}
                >
                  {(() => {
                    const rows = answer.waterfall!.data;
                    const maxValue = Math.max(
                      1,
                      ...rows.flatMap((row) => [
                        row.startEurCents,
                        row.endEurCents,
                      ]),
                    );
                    const axisMax =
                      Math.ceil(maxValue / 4 / 10000) * 10000 * 4 || 10000;
                    const left = Math.max(104, eur(axisMax).length * 7 + 20);
                    const right = 880;
                    const top = 28;
                    const bottom = 310;
                    const scale = (bottom - top) / axisMax;
                    const step = (right - left) / rows.length;
                    const y = (value: number) => bottom - value * scale;
                    return (
                      <>
                        {[0, 1, 2, 3, 4].map((tick) => {
                          const value = (axisMax * tick) / 4;
                          const tickY = y(value);
                          return (
                            <g key={tick}>
                              <line
                                x1={left}
                                x2={right}
                                y1={tickY}
                                y2={tickY}
                                className="chart-gridline"
                              />
                              <text
                                x={left - 12}
                                y={tickY + 4}
                                textAnchor="end"
                                className="chart-axis-label"
                              >
                                {eur(value)}
                              </text>
                            </g>
                          );
                        })}
                        <line
                          x1={left}
                          x2={left}
                          y1={top}
                          y2={bottom}
                          className="chart-axis"
                        />
                        {rows.map((row, index) => {
                          const x = left + step * index + (step - 78) / 2;
                          const startY = y(row.startEurCents);
                          const endY = y(row.endEurCents);
                          const barY = Math.min(startY, endY);
                          const barHeight = Math.max(
                            2,
                            Math.abs(endY - startY),
                          );
                          const nextX =
                            left + step * (index + 1) + (step - 78) / 2;
                          const isTotal =
                            index === 0 || index === rows.length - 1;
                          const labelY =
                            row.valueEurCents < 0
                              ? barY + barHeight + 17
                              : barY - 8;
                          return (
                            <g key={row.label}>
                              <rect
                                x={x}
                                y={barY}
                                width="78"
                                height={barHeight}
                                className={
                                  isTotal
                                    ? 'chart-total'
                                    : row.valueEurCents < 0
                                      ? 'chart-negative'
                                      : 'chart-positive'
                                }
                              />
                              <text
                                x={x + 39}
                                y={labelY}
                                textAnchor="middle"
                                className="chart-value-label"
                              >
                                {eur(row.valueEurCents)}
                              </text>
                              <text
                                x={x + 39}
                                y="339"
                                textAnchor="middle"
                                className="chart-category-label"
                              >
                                {row.label}
                              </text>
                              {index < rows.length - 1 && (
                                <line
                                  x1={x + 78}
                                  x2={nextX}
                                  y1={endY}
                                  y2={endY}
                                  className="chart-connector"
                                />
                              )}
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              </div>
              <details className="supporting-details chart-details">
                <summary>Values & sources</summary>
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
                  onClick={() =>
                    void inspect(answer.waterfall!.sourceEvidenceId)
                  }
                >
                  Inspect waterfall evidence
                </button>
              </details>
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
              answer.context.map((item, index) => (
                <div className="claim context-claim" key={index}>
                  <MarkdownContent text={item.text} />
                  <CopyMarkdownButton text={item.text} />
                  <EvidenceLinks>
                    {item.evidenceIds.map((id) => (
                      <button
                        type="button"
                        key={id}
                        onClick={() => void inspect(id)}
                        aria-controls="evidence-detail"
                      >
                        {citationLabel(id)}
                      </button>
                    ))}
                  </EvidenceLinks>
                </div>
              ))
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
          <section
            className="result-section follow-section"
            aria-labelledby="churn-heading"
            aria-busy={busy}
          >
            <h2 id="churn-heading">Customer churn rate</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => void churnFollowUp()}
            >
              Calculate customer churn
            </button>
            {churnMessage && (
              <p
                className={churnAnswer ? 'sr-only' : 'inline-status'}
                role="status"
                aria-live="polite"
              >
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
                <div
                  className="churn-highlight"
                  aria-label="Customer churn result"
                >
                  <p className="churn-rate-value">
                    {churnAnswer.value.rate === null
                      ? '—'
                      : `${(churnAnswer.value.rate * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`}
                  </p>
                  <div className="churn-rate-copy">
                    <p className="churn-rate-label">Customer churn rate</p>
                    <p className="churn-count">
                      <strong>{churnAnswer.value.churnedCustomers}</strong> of{' '}
                      <strong>{churnAnswer.value.startingCustomers}</strong>{' '}
                      starting customers churned
                    </p>
                    {churnAnswer.value.rate === null && (
                      <p className="meta-line">
                        Rate unavailable because there were no starting
                        customers.
                      </p>
                    )}
                  </div>
                </div>
                <EvidenceLinks>
                  <p className="meta-line">
                    Source status:{' '}
                    {churnAnswer.evidence
                      .filter((item) => item.type === 'metric_query')
                      .map(
                        (item) =>
                          `${String(item.scope.month).slice(0, 7)} ${String(item.scope.sourceStatus ?? 'unknown')}`,
                      )
                      .join(' · ')}
                  </p>

                  {churnAnswer.sourceEvidenceIds.map((id) => {
                    const item = churnAnswer.evidence.find(
                      (candidate) => candidate.evidenceId === id,
                    );
                    const label =
                      item?.type === 'metric_query'
                        ? `Inspect churn query · ${String(item.scope.month).slice(0, 7)}`
                        : 'Inspect churn calculation';
                    return (
                      <button
                        type="button"
                        key={id}
                        aria-controls="evidence-detail"
                        onClick={() => void inspect(id, churnSession.current)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </EvidenceLinks>
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
              disabled={busy}
              onClick={() => void followUp()}
            >
              Break down by country
            </button>
            {followMessage && (
              <p
                className={followAnswer ? 'sr-only' : 'inline-status'}
                role="status"
                aria-live="polite"
              >
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
          {(customerMessage || customerAnswer) && (
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
              ].map((text, index) => (
                <button
                  key={text}
                  type="button"
                  disabled={busy}
                  onClick={() => void crossSource(text)}
                  aria-label={text}
                >
                  {
                    [
                      'Investigate possible reasons',
                      'Support & usage',
                      'Pricing evidence',
                    ][index]
                  }
                </button>
              ))}
            </div>
            {crossMessage && (
              <p
                className={crossAnswer ? 'sr-only' : 'inline-status'}
                role="status"
                aria-live="polite"
              >
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
                <details className="supporting-details">
                  <summary>How context was investigated</summary>
                  <p className="meta-line">
                    Approved plan: {crossAnswer.record.plan.steps.join(' → ')} ·
                    Plan source: {crossAnswer.record.plan.planner} · Hypothesis
                    review: {crossAnswer.record.modelStatus}
                  </p>
                  <p className="ai-explanation">
                    {crossAnswer.record.plan.planner === 'model' ||
                    crossAnswer.record.modelStatus !== 'disabled'
                      ? 'AI may select among approved context sources and propose tentative explanations. The app checks each proposal against cited evidence; MRR values and customer scope come from validated data.'
                      : 'No AI model was used for this context follow-up. The app queried the approved sources; MRR values and customer scope come from validated data.'}
                  </p>
                </details>
                {crossAnswer.evidence
                  .filter(
                    (item) => item.source === 'synthetic_operational_records',
                  )
                  .map((item) => (
                    <details
                      className="supporting-details cross-source"
                      key={item.evidenceId}
                    >
                      <summary>
                        {String(item.scope.source).toUpperCase()} records
                      </summary>
                      <p className="meta-line">
                        Source status: {String(item.scope.sourceStatus)} ·
                        Freshness: {item.freshness} · Missing coverage:{' '}
                        {Array.isArray(item.content.missingCustomerIds)
                          ? item.content.missingCustomerIds.join(', ') || 'None'
                          : 'Unavailable'}{' '}
                        · Stale coverage:{' '}
                        {Array.isArray(item.content.staleCustomerIds)
                          ? item.content.staleCustomerIds.join(', ') || 'None'
                          : 'Unavailable'}
                      </p>
                      <p className="meta-line">
                        Confirmed no events:{' '}
                        {Array.isArray(item.content.confirmedAbsentCustomerIds)
                          ? item.content.confirmedAbsentCustomerIds.join(
                              ', ',
                            ) || 'None'
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
                    </details>
                  ))}
                {crossAnswer.evidence
                  .filter((item) => item.type === 'document_chunk')
                  .map((item) => (
                    <div className="cross-source" key={item.evidenceId}>
                      <h3>Document context</h3>
                      <div className="cross-document-excerpt">
                        <MarkdownContent
                          text={String(item.content.excerpt ?? '')}
                        />
                        <CopyMarkdownButton
                          text={String(item.content.excerpt ?? '')}
                        />
                      </div>
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
                      {citationLabel(item.evidenceId)}
                    </button>
                    <span>
                      {item.type.replaceAll('_', ' ')} · {item.sourceRef} ·
                      {item.sourceStatus
                        ? ` Source: ${item.sourceStatus} ·`
                        : ''}{' '}
                      Freshness: {item.freshness}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </details>
          {record && (
            <details className="supporting-details trail-details">
              <summary className="cursor-pointer font-semibold">
                How this answer was generated
              </summary>
              <dl className="trail-meta">
                <div>
                  <dt>Investigation</dt>
                  <dd>{record.investigationId}</dd>
                </div>
                <div>
                  <dt>Outcome</dt>
                  <dd>
                    <span className="outcome-pill">{record.status}</span>
                  </dd>
                </div>
              </dl>
              <p className="trail-intro">Steps ran in this order:</p>
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
                      Inspect trail ·{' '}
                      {citationLabel(item.evidenceId).replace(/^Inspect /, '')}
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
                {typeof evidence.scope.sourceStatus === 'string' && (
                  <>
                    <dt>Source status</dt>
                    <dd>{evidence.scope.sourceStatus}</dd>
                  </>
                )}
                <dt>Integrity</dt>
                <dd>{evidence.integrity}</dd>
              </dl>
              <details className="evidence-technical">
                <summary>Technical scope</summary>
                <pre>{JSON.stringify(evidence.scope, null, 2)}</pre>
              </details>
              {evidence.type === 'document_chunk' &&
              typeof evidence.content.excerpt === 'string' ? (
                <>
                  <h3>Supporting values or document excerpt</h3>
                  <div className="evidence-document-excerpt">
                    <MarkdownContent text={evidence.content.excerpt} />
                    <CopyMarkdownButton text={evidence.content.excerpt} />
                  </div>
                </>
              ) : (
                <>
                  <h3>Supporting values or document excerpt</h3>
                  <details className="evidence-technical">
                    <summary>View structured values</summary>
                    <pre>{JSON.stringify(evidence.content, null, 2)}</pre>
                  </details>
                </>
              )}
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
