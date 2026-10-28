"use client";

import { useEffect, useState } from "react";
import { apiBase } from "@/lib/config";
import { zeepFetch } from "@/lib/api/zfetch";
import { formatCredits } from "@/lib/zeep";
import { isFundsError, payJson, requestError } from "@/lib/zeep/pay";
import { readSession } from "@/lib/vault/session";
import { Button } from "@/components/Button";
import { MarkdownText } from "@/components/find/MarkdownText";
import { QueryBar, ResultList } from "@/components/find/QueryBar";
import { Toggle, type ToggleOption } from "@/components/ui/Toggle";
import { useForge } from "@/lib/fx/useForge";
import { Page } from "@/components/Panel";
import { useVault } from "@/components/Providers";

type Hit = { title?: string; url?: string; snippet?: string };
type Level = "base" | "core" | "pro";
type Mode = "web" | Level;

const LEVELS: { id: Level; label: string; route: `research_${Level}` }[] = [
  { id: "base", label: "Base", route: "research_base" },
  { id: "core", label: "Core", route: "research_core" },
  { id: "pro", label: "Pro", route: "research_pro" },
];

type Citation = { title: string; url?: string };

function citationOf(item: unknown): Citation | null {
  if (typeof item === "string") return /^https?:\/\//.test(item) ? { title: item, url: item } : { title: item };
  if (!item || typeof item !== "object") return null;
  const row = item as { title?: unknown; url?: unknown; text?: unknown };
  const url = typeof row.url === "string" && /^https?:\/\//.test(row.url) ? row.url : undefined;
  const title = typeof row.title === "string" ? row.title : typeof row.text === "string" ? row.text : url;
  if (!title) return null;
  return { title, url };
}

function researchView(result: unknown): { text: string; citations: Citation[] } {
  if (typeof result === "string") return { text: result, citations: [] };
  if (result && typeof result === "object" && "content" in result && typeof result.content === "string") {
    const raw = (result as { content: string; citations?: unknown }).citations;
    const citations = Array.isArray(raw)
      ? raw.flatMap((item) => {
          const citation = citationOf(item);
          return citation ? [citation] : [];
        })
      : [];
    return { text: result.content, citations };
  }
  return { text: JSON.stringify(result, null, 2), citations: [] };
}

export function SearchScreen() {
  const { view } = useVault();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("web");
  const [hits, setHits] = useState<Hit[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [researchStatus, setResearchStatus] = useState("");
  const [researchText, setResearchText] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [busy, setBusy] = useState<"search" | "research" | null>(null);
  const [error, setError] = useState("");
  const [funds, setFunds] = useState(false);
  const forge = useForge();
  const webPrice = view.prices?.routes.search.micro_usd;
  const level = mode === "web" ? "base" : mode;
  const levelPrice = view.prices?.routes[LEVELS.find((item) => item.id === level)?.route ?? "research_base"]?.micro_usd;
  const price = mode === "web" ? webPrice : levelPrice;
  const modeOptions: ToggleOption<Mode>[] = [
    { value: "web", label: webPrice === undefined ? "Web" : `Web · ${formatCredits(webPrice, view.microPerCredit)} cr` },
    ...LEVELS.map((item) => {
      const micro = view.prices?.routes[item.route]?.micro_usd;
      const credits = micro === undefined ? "" : ` · ${formatCredits(micro, view.microPerCredit)} cr`;
      return { value: item.id, label: `${item.label}${credits}` };
    }),
  ];
  const asked = hits.length > 0 || Boolean(researchText) || researchStatus === "running";

  async function search() {
    const session = readSession();
    if (!session || price === undefined) return;
    setBusy("search");
    setError("");
    setFunds(false);
    try {
      const body = await forge.track(() =>
        payJson<{ results?: Hit[]; hits?: Hit[] }>(session.client, "POST", "/v1/search", { query }, BigInt(price)),
      );
      setHits(body.results ?? body.hits ?? []);
    } catch (cause) {
      setFunds(isFundsError(cause));
      setError(requestError(cause, "Search failed."));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!jobId || researchStatus === "completed" || researchStatus === "failed") return;
    let stop = false;
    const pull = () => {
      void zeepFetch(view.network)(`${apiBase(view.network)}/v1/jobs/${jobId}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(`The research job returned ${response.status}.`);
          return response.json() as Promise<{ status?: string; result?: unknown }>;
        })
        .then((body) => {
          if (stop) return;
          const status = body.status ?? "running";
          setResearchStatus(status);
          if (status === "completed") {
            const answer = researchView(body.result);
            setResearchText(answer.text);
            setCitations(answer.citations);
          }
          if (status === "failed") setError("The research job failed.");
        })
        .catch((cause: unknown) => {
          if (!stop) setError(cause instanceof Error ? cause.message : "The research job did not load.");
        });
    };
    pull();
    const timer = window.setInterval(pull, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [jobId, researchStatus, view.network]);

  async function research() {
    const session = readSession();
    if (!session || price === undefined || mode === "web") return;
    setBusy("research");
    setError("");
    setFunds(false);
    setResearchText("");
    setCitations([]);
    setJobId(null);
    setResearchStatus("running");
    try {
      const body = await forge.track(() =>
        payJson<{ job_id: string }>(session.client, "POST", "/v1/research", { query, processor: level }, BigInt(price)),
      );
      setJobId(body.job_id);
    } catch (cause) {
      setResearchStatus("");
      setFunds(isFundsError(cause));
      setError(requestError(cause, "Research failed."));
    } finally {
      setBusy(null);
    }
  }

  const searching = busy !== null;

  return (
    <Page>
      <div className={asked ? "mx-auto max-w-3xl" : "mx-auto flex min-h-[62vh] max-w-2xl flex-col justify-center"}>
        <h1 className={asked ? "sr-only" : "mb-6 text-center text-[40px] font-semibold tracking-[-0.03em]"}>Search</h1>
        <Toggle layout="chips" label="Search mode" options={modeOptions} value={mode} onChange={setMode} className={asked ? "mb-4" : "mb-4 justify-center"} />
        <QueryBar
          value={query}
          onChange={setQuery}
          onSubmit={() => void (mode === "web" ? search() : research())}
          placeholder={mode === "web" ? "Search the web" : "Research a question"}
          label="Query"
          phase={searching ? forge.phase : "idle"}
          disabled={searching || !query.trim() || price === undefined}
          submitLabel={mode === "web" ? "Search" : "Research"}
          settledLabel={mode === "web" ? "Found" : "Started"}
        />
        {researchStatus === "running" ? <p className="mt-4 text-[13px] text-muted">Research is running…</p> : null}
        {error ? <p className="mt-4 text-[13px] text-danger">{error}</p> : null}
        {funds ? <Button href="/wallet?action=deposit" variant="secondary" className="mt-4">Add funds</Button> : null}
        {researchText ? <MarkdownText text={researchText} /> : null}
        {citations.length ? (
          <ul className="mt-4 grid gap-1 text-[13px]">
            {citations.map((item) => (
              <li key={item.url ?? item.title}>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="text-muted underline decoration-line-strong underline-offset-2 hover:text-gold">{item.title}</a>
                ) : (
                  <span className="text-muted">{item.title}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <ResultList items={hits.map((hit) => ({ title: hit.title || hit.url || "Result", url: hit.url, snippet: hit.snippet }))} />
      </div>
    </Page>
  );
}
