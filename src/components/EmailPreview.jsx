import React, { useMemo } from 'react';
import { bodyToHtml, sanitizeSignatureHtml, signatureIsEmpty } from '../lib/signature';

// Shows the email the way the recipient's inbox will: the body text followed by
// the (sanitised) signature. The HTML is rebuilt from the same rules the server
// uses, and passed through the sanitiser first, so nothing unsafe is ever drawn.
export default function EmailPreview({ body, signatureHtml, withSignature = true }) {
  const html = useMemo(() => {
    const sig = withSignature && !signatureIsEmpty(signatureHtml) ? sanitizeSignatureHtml(signatureHtml) : '';
    return bodyToHtml(body) + (sig ? `<div style="margin-top:6px">${sig}</div>` : '');
  }, [body, signatureHtml, withSignature]);
  // eslint-disable-next-line react/no-danger
  return <div className="preview" data-testid="email-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}
