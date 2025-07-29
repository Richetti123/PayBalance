// lib/keywords.js

/**
 * Checks if a given message caption/text indicates a payment proof based on keywords.
 * @param {string} captionText - The text caption associated with the media message.
 * @returns {boolean} True if it contains payment proof keywords, false otherwise.
 */
export function isPaymentProof(captionText) {
    if (!captionText) {
        return false;
    }
    const lowerCaseCaption = captionText.toLowerCase();
    const keywords = ['pago', 'comprobante', 'recibo', 'voucher']; 

    return keywords.some(keyword => lowerCaseCaption.includes(keyword.toLowerCase()));
}