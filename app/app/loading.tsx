export default function StudioLoading() {
  return (
    <div className="ss-loading-skel" aria-hidden="true">
      <div className="ss-loading-skel__bar ss-loading-skel__bar--w60" />
      <div className="ss-loading-skel__grid">
        <div className="ss-loading-skel__card" />
        <div className="ss-loading-skel__card" />
        <div className="ss-loading-skel__card" />
      </div>
    </div>
  );
}
