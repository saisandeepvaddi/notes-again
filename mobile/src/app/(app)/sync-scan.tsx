import { useRouter } from "expo-router";
import { useConnectSync } from "@/api/sync";
import { ScanScreen } from "@/screens/scan";

export default function SyncScan() {
  const router = useRouter();
  const connect = useConnectSync();
  return (
    <ScanScreen
      purpose="Notes Again uses the camera only to read the sync QR code shown on your computer or server."
      onLink={async (link) => {
        await connect.mutateAsync({ url: link.server, token: link.token });
        router.back();
      }}
    />
  );
}
