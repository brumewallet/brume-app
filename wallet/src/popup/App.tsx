import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Activity } from "./pages/Activity";
import { AddAccount } from "./pages/AddAccount";
import { AddHdAccount } from "./pages/AddHdAccount";
import { ManageAccounts } from "./pages/ManageAccounts";
import { EditAccount } from "./pages/EditAccount";
import { PrivateKey } from "./pages/PrivateKey";
import { ApproveConnect } from "./pages/ApproveConnect";
import { ApproveSign } from "./pages/ApproveSign";
import { CreateWallet } from "./pages/CreateWallet";
import { Dashboard } from "./pages/Dashboard";
import { Disclosure } from "./pages/Disclosure";
import { ImportPrivateKey } from "./pages/ImportPrivateKey";
import { ImportOptions } from "./pages/ImportOptions";
import { ImportWallet } from "./pages/ImportWallet";
import { Receive } from "./pages/Receive";
import { Send } from "./pages/Send";
import { SendSol } from "./pages/SendSol";
import { SendSpl } from "./pages/SendSpl";
import { TokenDetail } from "./pages/TokenDetail";
import { SendSuccess } from "./pages/SendSuccess";
import { NFTs } from "./pages/NFTs";
import { Settings } from "./pages/Settings";
import { Shield } from "./pages/Shield";
import { Unlock } from "./pages/Unlock";
import { Welcome } from "./pages/Welcome";
import { AnimatedOutlet } from "./components/AnimatedOutlet";
import { MainShell } from "./components/MainShell";
import { PopupErrorBoundary } from "./components/PopupErrorBoundary";
import { JupiterPortfolioPricesProvider } from "./context/JupiterPortfolioPrices";
import { useWalletStore } from "./store";

function Loading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-6">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}

function GuardLayout() {
  const location = useLocation();
  const { state, loading, error, refresh } = useWalletStore();

  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (loading && !state) return <Loading />;
  if (error && !state) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-background p-6 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!state) return <Loading />;

  const path = location.pathname;

  if (state.pendingConnect && path !== "/approve-connect") {
    return <Navigate to="/approve-connect" replace />;
  }
  if (state.pendingSign && path !== "/approve-sign") {
    return <Navigate to="/approve-sign" replace />;
  }

  if (path === "/approve-connect" && !state.pendingConnect) {
    return <Navigate to="/" replace />;
  }
  if (path === "/approve-sign" && !state.pendingSign) {
    return <Navigate to="/" replace />;
  }

  if (!state.hasVault) {
    const allowed = ["/welcome", "/create", "/import-options", "/import", "/import-private-key"];
    if (!allowed.includes(path)) {
      return <Navigate to="/welcome" replace />;
    }
  } else if (state.locked) {
    if (path !== "/unlock") {
      return <Navigate to="/unlock" replace />;
    }
  } else if (
    ["/welcome", "/create", "/import-options", "/import", "/import-private-key", "/unlock"].includes(
      path,
    )
  ) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PopupErrorBoundary>
        <JupiterPortfolioPricesProvider>
          <AnimatedOutlet />
        </JupiterPortfolioPricesProvider>
      </PopupErrorBoundary>
    </div>
  );
}

export function App() {
  return (
    <div className="flex h-full min-h-0 min-w-[360px] flex-1 flex-col overflow-hidden bg-background">
      <Routes>
        <Route element={<GuardLayout />}>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/create" element={<CreateWallet />} />
          <Route path="/import-options" element={<ImportOptions />} />
          <Route path="/import" element={<ImportWallet />} />
          <Route path="/import-private-key" element={<ImportPrivateKey />} />
          <Route path="/accounts/create" element={<CreateWallet />} />
          <Route path="/accounts/import-options" element={<ImportOptions />} />
          <Route path="/accounts/import" element={<ImportWallet />} />
          <Route
            path="/accounts/import-private-key"
            element={<ImportPrivateKey />}
          />
          <Route path="/unlock" element={<Unlock />} />
          <Route path="/approve-connect" element={<ApproveConnect />} />
          <Route path="/approve-sign" element={<ApproveSign />} />
          <Route path="/send" element={<Send />} />
          <Route path="/send/sol" element={<SendSol />} />
          <Route path="/send/spl/:mint" element={<SendSpl />} />
          <Route path="/send/success" element={<SendSuccess />} />
          <Route path="/receive" element={<Receive />} />
          <Route path="/disclosure" element={<Disclosure />} />
          <Route path="/" element={<MainShell />}>
            <Route index element={<Dashboard />} />
            <Route path="token/:mint" element={<TokenDetail />} />
            <Route path="shield" element={<Shield />} />
            <Route path="nfts" element={<NFTs />} />
            <Route path="activity" element={<Activity />} />
            <Route path="settings" element={<Settings />} />
            <Route path="accounts" element={<ManageAccounts />} />
            <Route path="accounts/add" element={<AddAccount />} />
            <Route path="accounts/add-hd" element={<AddHdAccount />} />
            <Route path="accounts/:accountId/edit" element={<EditAccount />} />
            <Route
              path="accounts/:accountId/private-key"
              element={<PrivateKey />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </div>
  );
}
