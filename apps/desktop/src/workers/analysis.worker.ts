/// <reference lib="webworker" />
import { runWebsiteAnalysis } from "@lbf/core";
import type { AnalysisInput, AnalysisWorkerReply } from "../lib/analysis-client";
import { createWebPlatform } from "../lib/platform/web";

/**
 * Site analizinin ağır kısmı (HTML ayrıştırma, kontroller) burada, arayüzden ayrı iş parçacığında
 * çalışır. Sayfalar aynı origin'deki yerel sunucudan (`/api/website/fetch`) alınır.
 */
const fetcher = { fetchPage: createWebPlatform().fetchPage };

self.onmessage = (event: MessageEvent<{ id: number } & AnalysisInput>) => {
  const { id, websiteUrl, category } = event.data;
  runWebsiteAnalysis(fetcher, { websiteUrl, category })
    .then((result): AnalysisWorkerReply => ({ id, result }))
    .catch((error: unknown): AnalysisWorkerReply => ({ id, error: error instanceof Error ? error.message : "Bilinmeyen hata" }))
    .then((reply) => self.postMessage(reply));
};
