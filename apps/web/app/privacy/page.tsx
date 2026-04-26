export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <a className="legalBack" href="/">Obscribe</a>
      <section className="legalShell">
        <p className="kicker">Privacy</p>
        <h1>Privacy Policy</h1>
        <p>
          Obscribe is built for private notes and self-hosted ownership. Hosted accounts store the information needed to run
          the workspace: account details, notebooks, notes, invite status, and basic operational events.
        </p>
        <h2>Data We Store</h2>
        <p>
          We store your name, email address, hashed password, workspace content, and product events such as signups, logins,
          notebook creation, and note creation. Self-hosted installs keep this data on the operator's server.
        </p>
        <h2>Email</h2>
        <p>
          Email is used for verification, password recovery, invites, and operational notices. SMTP settings are controlled
          by the workspace operator.
        </p>
        <h2>Exports</h2>
        <p>
          Workspace export is available from settings. Self-hosted operators can also run full server backups and restore
          them using the documented scripts.
        </p>
        <h2>Contact</h2>
        <p>
          Questions about privacy can be sent through the contact page or to the operator of your Obscribe workspace.
        </p>
      </section>
    </main>
  );
}
