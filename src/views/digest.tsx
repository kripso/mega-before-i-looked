import type { NightDigest } from '../digest/types.js';

function present(value: string | null): string {
  return value === null || value.trim() === '' ? '—' : value;
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 && <p class="warn">bad lines: {digest.badLines}</p>}
      {digest.rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">job</th>
              <th scope="col">owner</th>
              <th scope="col">runs</th>
              <th scope="col">retries</th>
              <th scope="col">failures</th>
              <th scope="col">last status</th>
              <th scope="col">last error</th>
              <th scope="col">first time</th>
              <th scope="col">last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr>
                <th scope="row">{row.job}</th>
                <td>{present(row.owner)}</td>
                <td>{row.runs}</td>
                <td>
                  {row.retries >= 3 ? (
                    <span class="warn">{row.retries} · high retry count (3 or more)</span>
                  ) : row.retries}
                </td>
                <td>
                  {row.failures > 0 ? (
                    <span class="warn">
                      {row.failures} failed {row.failures === 1 ? 'run' : 'runs'}
                    </span>
                  ) : row.failures}
                </td>
                <td>{row.lastStatus}</td>
                <td>{present(row.lastError)}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
