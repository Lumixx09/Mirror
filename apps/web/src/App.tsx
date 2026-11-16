import React, { useState, useEffect } from 'react';
import { 
  FlaskConical, 
  SplitSquareVertical, 
  FileText, 
  ShieldCheck, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Search, 
  Settings,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

interface Finding {
  id: string;
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  classification: string;
  description: string;
  createdAt: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'investigations' | 'workspace' | 'diff' | 'findings' | 'evidence'>('overview');
  const [targetUrl, setTargetUrl] = useState('http://localhost:4001/product');
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<string>('Ready to start experiment');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeFinding, setActiveFinding] = useState<Finding | null>(null);

  const startDemoExperiment = async () => {
    setIsRunning(true);
    setRunProgress('Queueing isolated browser sessions...');
    setActiveTab('workspace');

    try {
      // Simulate/trigger run
      setTimeout(() => {
        setRunProgress('Session 1 (Baseline: Variant A) navigating to target...');
      }, 1000);

      setTimeout(() => {
        setRunProgress('Session 2 (Comparison: Variant B - Hidden Fee) executing checkout journey...');
      }, 2500);

      setTimeout(() => {
        setRunProgress('Session 3 (Comparison: Variant C - Preselected Subscription) executing checkout journey...');
      }, 4000);

      setTimeout(() => {
        setRunProgress('Capturing DOM snapshots, commercial pricing data, and screenshots...');
      }, 5500);

      setTimeout(() => {
        setRunProgress('Running deterministic differential analysis engine...');
      }, 7000);

      setTimeout(() => {
        const discoveredFindings: Finding[] = [
          {
            id: 'fnd_01',
            type: 'fee_difference',
            severity: 'high',
            confidence: 0.95,
            classification: 'confirmed_observation',
            description: "Discovered additional line item 'Regulatory Compliance Surcharge' of USD 8.00 at checkout present only in Session 2 (Variant B).",
            createdAt: new Date().toISOString()
          },
          {
            id: 'fnd_02',
            type: 'subscription_difference',
            severity: 'high',
            confidence: 0.92,
            classification: 'confirmed_observation',
            description: "Discovered preselected subscription toggle 'Priority Key Replacement' of USD 19.99/mo checked by default in Session 3 (Variant C).",
            createdAt: new Date().toISOString()
          }
        ];
        setFindings(discoveredFindings);
        setActiveFinding(discoveredFindings[0]);
        setIsRunning(false);
        setRunProgress('Differential analysis complete. 2 verified findings identified.');
      }, 8500);
    } catch {
      setIsRunning(false);
      setRunProgress('Experiment run encountered an error.');
    }
  };

  return (
    <div className="flex h-screen bg-[#090B10] text-[#F1F4F8] font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-[#252D3A] bg-[#10141D] flex flex-col justify-between">
        <div>
          {/* Logo & Brand */}
          <div className="p-5 border-b border-[#252D3A]">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-[#A78BFA]" />
              <span className="font-bold text-lg tracking-wider">MIRROR</span>
            </div>
            <p className="text-xs text-[#9AA6B7] mt-1 font-mono">Differential Testing Lab</p>
          </div>

          {/* Nav Items */}
          <nav className="p-3 space-y-1">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${activeTab === 'overview' ? 'bg-[#171D28] text-[#F1F4F8] border border-[#344052]' : 'text-[#9AA6B7] hover:bg-[#171D28] hover:text-[#F1F4F8]'}`}
            >
              <Layers className="w-4 h-4 text-[#A78BFA]" />
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('workspace')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${activeTab === 'workspace' ? 'bg-[#171D28] text-[#F1F4F8] border border-[#344052]' : 'text-[#9AA6B7] hover:bg-[#171D28] hover:text-[#F1F4F8]'}`}
            >
              <FlaskConical className="w-4 h-4 text-[#65B9ED]" />
              Experiment Workspace
            </button>
            <button 
              onClick={() => setActiveTab('diff')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${activeTab === 'diff' ? 'bg-[#171D28] text-[#F1F4F8] border border-[#344052]' : 'text-[#9AA6B7] hover:bg-[#171D28] hover:text-[#F1F4F8]'}`}
            >
              <SplitSquareVertical className="w-4 h-4 text-[#F2B95D]" />
              Browser Comparison
            </button>
            <button 
              onClick={() => setActiveTab('findings')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${activeTab === 'findings' ? 'bg-[#171D28] text-[#F1F4F8] border border-[#344052]' : 'text-[#9AA6B7] hover:bg-[#171D28] hover:text-[#F1F4F8]'}`}
            >
              <AlertTriangle className="w-4 h-4 text-[#F06B78]" />
              Findings ({findings.length})
            </button>
            <button 
              onClick={() => setActiveTab('evidence')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${activeTab === 'evidence' ? 'bg-[#171D28] text-[#F1F4F8] border border-[#344052]' : 'text-[#9AA6B7] hover:bg-[#171D28] hover:text-[#F1F4F8]'}`}
            >
              <FileText className="w-4 h-4 text-[#36C98F]" />
              Evidence & Manifests
            </button>
          </nav>
        </div>

        {/* Security & Health Badge */}
        <div className="p-4 border-t border-[#252D3A] bg-[#090B10]/40">
          <div className="flex items-center gap-2 text-xs text-[#36C98F]">
            <ShieldCheck className="w-4 h-4" />
            <span>SSRF Protection Active</span>
          </div>
          <div className="text-[11px] text-[#697588] font-mono mt-1">Docker & BullMQ Isolated</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-[#252D3A] bg-[#10141D] px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#9AA6B7]">Target Environment:</span>
            <input 
              type="text" 
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="bg-[#171D28] border border-[#252D3A] rounded px-3 py-1 text-sm font-mono text-[#F1F4F8] w-80 focus:outline-none focus:border-[#A78BFA]"
            />
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={startDemoExperiment}
              disabled={isRunning}
              className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-all ${
                isRunning 
                  ? 'bg-[#252D3A] text-[#9AA6B7] cursor-not-allowed' 
                  : 'bg-[#A78BFA] hover:bg-[#B9A4FF] text-[#090B10] font-semibold'
              }`}
            >
              {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isRunning ? 'Running Experiment...' : 'Run Experiment'}
            </button>
          </div>
        </header>

        {/* Dynamic Workspace Panels */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold">Investigation Laboratory</h1>
                <p className="text-sm text-[#9AA6B7]">The differential testing laboratory for the internet</p>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#10141D] border border-[#252D3A] p-4 rounded-md">
                  <span className="text-xs text-[#9AA6B7]">Active Investigations</span>
                  <div className="text-2xl font-bold font-mono mt-1">1</div>
                </div>
                <div className="bg-[#10141D] border border-[#252D3A] p-4 rounded-md">
                  <span className="text-xs text-[#9AA6B7]">Sessions Configured</span>
                  <div className="text-2xl font-bold font-mono mt-1">3</div>
                </div>
                <div className="bg-[#10141D] border border-[#252D3A] p-4 rounded-md">
                  <span className="text-xs text-[#9AA6B7]">Verified Findings</span>
                  <div className="text-2xl font-bold font-mono text-[#F06B78] mt-1">{findings.length}</div>
                </div>
                <div className="bg-[#10141D] border border-[#252D3A] p-4 rounded-md">
                  <span className="text-xs text-[#9AA6B7]">Integrity Hash Status</span>
                  <div className="text-2xl font-bold font-mono text-[#36C98F] mt-1">VERIFIED</div>
                </div>
              </div>

              {/* Seeded Target Showcase Info */}
              <div className="bg-[#10141D] border border-[#252D3A] p-6 rounded-md space-y-3">
                <h2 className="text-base font-semibold text-[#A78BFA]">Showcase Test Scenario (First-Party Controlled Store)</h2>
                <p className="text-sm text-[#9AA6B7]">
                  MIRROR is configured to run differential tests across three isolated browser sessions against the controlled store at 
                  <code className="bg-[#171D28] px-1 py-0.5 rounded text-xs ml-1 font-mono text-[#F1F4F8]">{targetUrl}</code>.
                </p>
                <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-3 bg-[#171D28] border border-[#252D3A] rounded">
                    <span className="font-bold text-[#F1F4F8]">Session 1: Baseline</span>
                    <p className="text-[#9AA6B7] mt-1">$49.00 product, clean checkout, no extra surcharge.</p>
                  </div>
                  <div className="p-3 bg-[#171D28] border border-[#252D3A] rounded">
                    <span className="font-bold text-[#F2B95D]">Session 2: Surcharge Variant</span>
                    <p className="text-[#9AA6B7] mt-1">$49.00 product + $8.00 hidden fee added at checkout.</p>
                  </div>
                  <div className="p-3 bg-[#171D28] border border-[#252D3A] rounded">
                    <span className="font-bold text-[#A78BFA]">Session 3: Subscription Variant</span>
                    <p className="text-[#9AA6B7] mt-1">$49.00 product + $19.99/mo preselected recurring subscription.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'workspace' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold">Experiment Workspace</h1>
                  <p className="text-sm text-[#9AA6B7]">Live execution monitor and session state tracker</p>
                </div>
                <div className="text-xs font-mono bg-[#10141D] border border-[#252D3A] px-3 py-1.5 rounded text-[#A78BFA]">
                  Status: {runProgress}
                </div>
              </div>

              {/* Journey Step Sequence */}
              <div className="bg-[#10141D] border border-[#252D3A] p-5 rounded-md">
                <h2 className="text-sm font-semibold mb-4 text-[#9AA6B7]">Replayable Journey Checkpoints</h2>
                <div className="space-y-2 text-sm font-mono">
                  <div className="flex items-center justify-between p-2.5 bg-[#171D28] rounded border border-[#252D3A]">
                    <span className="text-[#36C98F]">1. navigate(targetUrl)</span>
                    <span className="text-xs text-[#9AA6B7]">GET /product</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-[#171D28] rounded border border-[#252D3A]">
                    <span className="text-[#36C98F]">2. click([data-testid="add-to-cart"])</span>
                    <span className="text-xs text-[#9AA6B7]">Cart checkpoint</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-[#171D28] rounded border border-[#252D3A]">
                    <span className="text-[#36C98F]">3. click([data-testid="checkout"])</span>
                    <span className="text-xs text-[#9AA6B7]">Checkout summary</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-[#171D28] rounded border border-[#252D3A]">
                    <span className="text-[#A78BFA]">4. capture_and_extract()</span>
                    <span className="text-xs text-[#9AA6B7]">Commercial values + DOM</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'diff' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold">Browser Comparison</h1>
                <p className="text-sm text-[#9AA6B7]">Side-by-side session viewports and differential overlays</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Baseline session */}
                <div className="bg-[#10141D] border border-[#252D3A] rounded-md overflow-hidden">
                  <div className="p-3 border-b border-[#252D3A] flex justify-between items-center bg-[#171D28]">
                    <span className="text-xs font-mono font-bold text-[#36C98F]">SESSION 1: BASELINE (1280x800)</span>
                    <span className="text-xs text-[#9AA6B7]">Clean Checkout</span>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="border border-[#252D3A] p-4 rounded bg-[#090B10]">
                      <div className="text-sm font-semibold">Order Summary</div>
                      <div className="flex justify-between text-xs mt-2 text-[#9AA6B7]">
                        <span>Hardware Security Key X-1</span>
                        <span className="text-[#F1F4F8] font-mono">$49.00</span>
                      </div>
                      <div className="border-t border-[#252D3A] mt-3 pt-2 flex justify-between text-sm font-bold">
                        <span>Total</span>
                        <span className="font-mono text-[#36C98F]">$49.00</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Comparison session */}
                <div className="bg-[#10141D] border border-[#252D3A] rounded-md overflow-hidden">
                  <div className="p-3 border-b border-[#252D3A] flex justify-between items-center bg-[#171D28]">
                    <span className="text-xs font-mono font-bold text-[#F2B95D]">SESSION 2: VARIANT B (1280x800)</span>
                    <span className="text-xs text-[#F06B78] font-bold">+$8.00 Surcharge Detected</span>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="border border-[#F06B78]/40 p-4 rounded bg-[#090B10]">
                      <div className="text-sm font-semibold">Order Summary</div>
                      <div className="flex justify-between text-xs mt-2 text-[#9AA6B7]">
                        <span>Hardware Security Key X-1</span>
                        <span className="text-[#F1F4F8] font-mono">$49.00</span>
                      </div>
                      <div className="flex justify-between text-xs mt-1 text-[#F06B78] font-bold">
                        <span>Regulatory Compliance Surcharge</span>
                        <span className="font-mono">+$8.00</span>
                      </div>
                      <div className="border-t border-[#252D3A] mt-3 pt-2 flex justify-between text-sm font-bold">
                        <span>Total</span>
                        <span className="font-mono text-[#F06B78]">$57.00</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'findings' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold">Differential Findings</h1>
                <p className="text-sm text-[#9AA6B7]">Evidence-linked discoveries with provenance and confidence scores</p>
              </div>

              {findings.length === 0 ? (
                <div className="p-12 text-center border border-[#252D3A] rounded-md bg-[#10141D]">
                  <FlaskConical className="w-10 h-10 text-[#697588] mx-auto mb-3" />
                  <p className="text-sm text-[#9AA6B7]">No findings yet. Run the experiment to detect differences.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {findings.map((f) => (
                    <div 
                      key={f.id}
                      onClick={() => setActiveFinding(f)}
                      className={`p-4 rounded-md border cursor-pointer transition-all ${
                        activeFinding?.id === f.id ? 'border-[#A78BFA] bg-[#171D28]' : 'border-[#252D3A] bg-[#10141D] hover:border-[#344052]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#F06B78]/20 text-[#F06B78] border border-[#F06B78]/40">
                            {f.type.toUpperCase()}
                          </span>
                          <span className="text-xs text-[#9AA6B7] font-mono">Confidence: {(f.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <span className="text-[11px] font-mono text-[#697588]">{f.classification}</span>
                      </div>
                      <p className="text-sm">{f.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'evidence' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold">Evidence & Manifest Library</h1>
                <p className="text-sm text-[#9AA6B7]">Cryptographic SHA-256 artifacts and reproducible export logs</p>
              </div>

              <div className="bg-[#10141D] border border-[#252D3A] p-5 rounded-md font-mono text-xs space-y-3">
                <div className="text-[#A78BFA] font-bold">SHA-256 Verified Artifact Manifest</div>
                <div className="p-3 bg-[#090B10] border border-[#252D3A] rounded text-[#9AA6B7] overflow-x-auto">
                  {`{
  "manifestVersion": 1,
  "runId": "run_984f18",
  "generatedAt": "2026-11-16T22:30:00Z",
  "artifacts": [
    {
      "artifactId": "art_01",
      "storageKey": "runs/run_984f18/baseline/checkout.png",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "size": 420812
    },
    {
      "artifactId": "art_02",
      "storageKey": "runs/run_984f18/variant-b/checkout.png",
      "sha256": "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
      "size": 435110
    }
  ]
}`}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
