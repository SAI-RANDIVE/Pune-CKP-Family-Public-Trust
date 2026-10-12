'use client';

/**
 * Last-resort screen for the management system (sign-in page included) when
 * something fails outside the signed-in frame, for example when the database
 * cannot be reached. Both languages, because the language is not known here.
 */
export default function TmsRootError({ reset }) {
  return (
    <main className="tms-login">
      <div className="tms-login-box">
        <div className="tms-alert tms-alert--error" role="alert" style={{ display: 'block' }}>
          <h1 style={{ fontSize: '1.4rem' }}>काहीतरी चुकले. आपली माहिती सुरक्षित आहे.</h1>
          <p style={{ marginTop: '0.5rem' }}>कृपया थोड्या वेळाने पुन्हा प्रयत्न करा. इंटरनेट जोडणी तपासा.</p>
          <p style={{ marginTop: '0.75rem' }} lang="en">Something went wrong. Your data is safe. Please check the internet connection and try again.</p>
          <div className="tms-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="tms-btn" onClick={() => reset()}>पुन्हा प्रयत्न करा / Try again</button>
          </div>
        </div>
      </div>
    </main>
  );
}
