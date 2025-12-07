import { ZapService } from '@pubpay/shared-services';
import type { AuthState } from '../types/postTypes';
import type { PubPayPost } from '../types/postTypes';

interface UsePaymentsOptions {
  zapServiceRef: React.MutableRefObject<ZapService | null>;
  authState: AuthState;
  setPaymentErrors: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  onLoginRequired?: () => void;
}

export const usePayments = ({
  zapServiceRef,
  authState,
  setPaymentErrors,
  onLoginRequired
}: UsePaymentsOptions) => {
  const handlePayWithExtension = async (
    post: PubPayPost,
    amount: number,
    comment: string = ''
  ) => {
    if (!authState.isLoggedIn) {
      if (onLoginRequired) {
        onLoginRequired();
      }
      return;
    }

    // Only require extension API when sign-in method is actually 'extension'
    if (authState.signInMethod === 'extension') {
      if (!window.nostr) {
        console.error('Nostr extension not available');
        return;
      }
    }

    if (!zapServiceRef.current) {
      console.error('Zap service not initialized');
      return;
    }

    try {
      console.log('Processing zap payment:', amount, 'sats for post:', post.id);

      // Get author data
      if (!post.author) {
        console.error('No author data found');
        return;
      }

      // Get Lightning callback (pass raw author object, not parsed content)
      let callback;
      try {
        callback = await zapServiceRef.current.getInvoiceCallBack(
          post.event,
          post.author
        );
        if (!callback) {
          const errorMessage = "CAN'T PAY: Failed to get Lightning callback";
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.set(post.id, errorMessage);
            return next;
          });
          console.error('Failed to get Lightning callback');
          return;
        }
        // Clear error if callback succeeds
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.delete(post.id);
          return next;
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "CAN'T PAY: Payment failed";
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.set(post.id, errorMessage);
          return next;
        });
        console.error('Failed to get Lightning callback:', error);
        return;
      }

      // Get user's public key
      const publicKey = authState.publicKey;
      if (!publicKey) {
        console.error('No public key found');
        return;
      }

      // Create zap event
      const zapEventData = await zapServiceRef.current.createZapEvent(
        post.event,
        amount,
        callback.lud16ToZap,
        publicKey,
        comment
      );

      if (!zapEventData) {
        console.error('Failed to create zap event');
        return;
      }

      // Sign and send zap event (ZapService will branch per sign-in method)
      // Note: signZapEvent may throw errors with "CAN'T PAY:" prefix
      // Pass decrypted private key from auth state if available (for password-encrypted keys)
      try {
        const success = await zapServiceRef.current.signZapEvent(
          zapEventData.zapEvent,
          callback.callbackToZap,
          zapEventData.amountPay,
          callback.lud16ToZap,
          post.id,
          false, // not anonymous
          authState.privateKey // Pass decrypted private key from auth state
        );

        if (success) {
          console.log('Zap payment initiated successfully');
          // The ZapService will trigger the payment UI via custom event
          // Clear error on success
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.delete(post.id);
            return next;
          });
        } else {
          const errorMessage = "CAN'T PAY: Failed to sign and send zap event";
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.set(post.id, errorMessage);
            return next;
          });
          console.error('Failed to sign and send zap event');
        }
      } catch (signError) {
        // signZapEvent can throw errors from getInvoiceandPay
        const errorMessage =
          signError instanceof Error ? signError.message : "CAN'T PAY: Payment failed";
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.set(post.id, errorMessage);
          return next;
        });
        console.error('Error in signZapEvent:', signError);
        return; // Don't continue after error
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "CAN'T PAY: Payment failed";
      setPaymentErrors(prev => {
        const next = new Map(prev);
        next.set(post.id, errorMessage);
        return next;
      });
      console.error('Payment failed:', err);
    }
  };

  const handlePayAnonymously = async (
    post: PubPayPost,
    amount: number,
    comment: string = ''
  ) => {
    if (!zapServiceRef.current) {
      console.error('Zap service not initialized');
      return;
    }

    try {
      console.log(
        'Processing anonymous zap payment:',
        amount,
        'sats for post:',
        post.id
      );

      // Get author data
      if (!post.author) {
        console.error('No author data found');
        return;
      }

      // Get Lightning callback (pass raw author object, not parsed content)
      let callback;
      try {
        callback = await zapServiceRef.current.getInvoiceCallBack(
          post.event,
          post.author
        );
        if (!callback) {
          const errorMessage = "CAN'T PAY: Failed to get Lightning callback";
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.set(post.id, errorMessage);
            return next;
          });
          console.error('Failed to get Lightning callback');
          return;
        }
        // Clear error if callback succeeds
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.delete(post.id);
          return next;
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "CAN'T PAY: Payment failed";
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.set(post.id, errorMessage);
          return next;
        });
        console.error('Failed to get Lightning callback:', error);
        return;
      }

      // Create zap event (no public key for anonymous)
      const zapEventData = await zapServiceRef.current.createZapEvent(
        post.event,
        amount,
        callback.lud16ToZap,
        null, // No public key for anonymous zap
        comment
      );

      if (!zapEventData) {
        console.error('Failed to create zap event');
        return;
      }

      // Sign and send zap event (anonymous = true)
      // Note: signZapEvent may throw errors with "CAN'T PAY:" prefix
      try {
        const success = await zapServiceRef.current.signZapEvent(
          zapEventData.zapEvent,
          callback.callbackToZap,
          zapEventData.amountPay,
          callback.lud16ToZap,
          post.id,
          true, // anonymous zap
          null // No private key for anonymous zaps
        );

        if (success) {
          console.log('Anonymous zap payment initiated successfully');
          // The ZapService will trigger the payment UI via custom event
          // Clear error on success
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.delete(post.id);
            return next;
          });
        } else {
          const errorMessage = "CAN'T PAY: Failed to initiate anonymous zap payment";
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.set(post.id, errorMessage);
            return next;
          });
          console.error('Failed to initiate anonymous zap payment');
        }
      } catch (signError) {
        // signZapEvent can throw errors from getInvoiceandPay
        const errorMessage =
          signError instanceof Error ? signError.message : "CAN'T PAY: Payment failed";
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.set(post.id, errorMessage);
          return next;
        });
        console.error('Error in signZapEvent (anonymous):', signError);
        return; // Don't continue after error
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "CAN'T PAY: Payment failed";
      setPaymentErrors(prev => {
        const next = new Map(prev);
        next.set(post.id, errorMessage);
        return next;
      });
      console.error('Anonymous zap payment failed:', err);
    }
  };

  const handlePayWithWallet = async (post: PubPayPost, amount: number) => {
    try {
      // This would generate a Lightning invoice
      console.log('Paying with wallet:', amount, 'sats for post:', post.id);
    } catch (err) {
      console.error('Payment failed:', err);
      console.error('Payment failed');
    }
  };

  const handleCopyInvoice = async (invoice: string) => {
    try {
      await navigator.clipboard.writeText(invoice);
      console.log('Invoice copied to clipboard');
    } catch (err) {
      console.error('Failed to copy invoice:', err);
      console.error('Failed to copy invoice');
    }
  };

  return {
    handlePayWithExtension,
    handlePayAnonymously,
    handlePayWithWallet,
    handleCopyInvoice
  };
};

