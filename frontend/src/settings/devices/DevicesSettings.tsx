import { useState } from "react";
import { CopyIcon, QrCodeIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { ConnectQrCode } from "../api-tokens/ConnectQrCode";
import { buildConnectLink } from "../api-tokens/connectLink";
import {
  type Pairing,
  useConnections,
  useCreateExtensionToken,
  usePairPhone,
  useSetNetworkAccess,
} from "./devicesApi";

function showError(error: unknown, fallback: string) {
  toast.add({
    type: "error",
    priority: "high",
    description: error instanceof Error ? error.message : fallback,
  });
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ type: "success", description: `${what} copied` });
  } catch {
    toast.add({ type: "error", description: `Couldn't copy the ${what.toLowerCase()}` });
  }
}

function ExtensionSection({ localUrl }: { localUrl: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const { mutateAsync: createToken, isPending } = useCreateExtensionToken();

  const create = async () => {
    if (!localUrl) return;
    try {
      const { token } = await createToken();
      setLink(buildConnectLink({ server: localUrl, token }));
    } catch (error) {
      showError(error, "Couldn't create a token");
    }
  };

  return (
    <section className="flex flex-col gap-2" aria-labelledby="extension-heading">
      <h3 id="extension-heading" className="text-sm font-medium">
        Browser extension
      </h3>
      <p className="text-xs text-muted-foreground">
        The extension saves pages straight into this app while it's running
        {localUrl ? (
          <>
            , at <code className="font-mono">{localUrl}</code>
          </>
        ) : null}
        . In the extension's options, choose <strong>Use the desktop app</strong> and paste the link
        below.
      </p>
      {link ? (
        <div className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{link}</code>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Copy the extension link"
            onClick={() => void copy(link, "Link")}
          >
            <CopyIcon />
          </Button>
        </div>
      ) : (
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || !localUrl}
            onClick={() => void create()}
          >
            Create a link for the extension
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        The link holds a token that can only save notes. Revoke it in API tokens.
      </p>
    </section>
  );
}

function PhoneSection() {
  const { data } = useConnections();
  const { network } = data;
  const { mutateAsync: setNetwork, isPending: switching } = useSetNetworkAccess();
  const { mutateAsync: pairPhone, isPending: pairing } = usePairPhone();
  const [pairingInfo, setPairingInfo] = useState<Pairing | null>(null);

  const toggle = async (enabled: boolean) => {
    try {
      await setNetwork(enabled);
      if (!enabled) setPairingInfo(null);
    } catch (error) {
      showError(error, "Couldn't change phone access");
    }
  };

  const pair = async () => {
    try {
      setPairingInfo(await pairPhone());
    } catch (error) {
      showError(error, "Couldn't create a pairing code");
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="phone-heading">
      <label className="flex items-center justify-between gap-4">
        <span>
          <span id="phone-heading" className="block text-sm font-medium">
            Let my phone connect
          </span>
          <span className="block text-xs text-muted-foreground">
            Opens this app to phones on the same Wi-Fi, only for phones you pair with a QR code.
            Turning it off unpairs every phone.
          </span>
        </span>
        <Switch
          checked={network.enabled}
          disabled={switching}
          onCheckedChange={(checked) => void toggle(checked)}
        />
      </label>
      {network.enabled ? (
        <>
          <p className="text-xs text-muted-foreground">
            {network.urls.length > 0 ? (
              <>
                Reachable at <code className="font-mono">{network.urls.join(" or ")}</code>.{" "}
              </>
            ) : (
              "This computer doesn't seem to be on a network right now. "
            )}
            {network.paired_devices === 1
              ? "1 phone is paired."
              : `${network.paired_devices} phones are paired.`}
          </p>
          {pairingInfo ? (
            <ConnectQrCode
              token={pairingInfo.token}
              server={pairingInfo.server}
              alt={pairingInfo.alt}
              fingerprint={pairingInfo.fingerprint}
            />
          ) : (
            <div>
              <Button variant="outline" size="sm" disabled={pairing} onClick={() => void pair()}>
                <QrCodeIcon /> Pair a phone
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            If your computer asks whether Notes Again may accept incoming network connections,
            choose Allow, or the phone can't reach it. The phone works with this computer while both
            are on the same network and Notes Again is open. To use it anywhere, connect both to a
            server in Sync.
          </p>
        </>
      ) : null}
    </section>
  );
}

export function DevicesSettings() {
  const { data } = useConnections();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-sm font-medium">Phone & extension</h2>
        <p className="text-xs text-muted-foreground">
          Use this computer's notes from your phone and save pages from your browser, no server
          needed.
        </p>
      </div>
      <PhoneSection />
      <ExtensionSection localUrl={data.local_url} />
    </div>
  );
}
