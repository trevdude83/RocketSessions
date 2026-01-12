export default function BuildInfo() {
  const version = import.meta.env.VITE_APP_VERSION as string | undefined;
  const versionLabel = version ? `v${version}` : "v0.0.0";

  return (
    <div className="build-info">Current build: {versionLabel} (beta)</div>
  );
}
