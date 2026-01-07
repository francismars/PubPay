import React from 'react';
import { useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { LIGHTNING, COLORS, TIME } from '../../constants';
import { formatTimestamp } from '../../pages/PaymentsPage';
import type { Invoice } from '../../stores/useWalletStore';
import type { Kind0Event } from '@pubpay/shared-types';

interface PublicZap {
  id: string;
  amount: number;
  type: 'incoming' | 'outgoing';
  payerPubkey: string;
  recipientPubkey: string;
  payerProfile: Kind0Event | null;
  recipientProfile: Kind0Event | null;
  content: string;
  eventId: string | null;
  created_at: number;
  bolt11: string | null;
  preimage: string | null;
}

interface TransactionCardProps {
  // Common fields
  amount: number;
  type: 'incoming' | 'outgoing';
  created_at?: number;
  paid_at?: number;
  
  // Wallet transaction specific
  transaction?: Invoice;
  isInvoiceExpired?: (invoice: Invoice) => boolean;
  isInvoicePaid?: (invoice: Invoice) => boolean;
  
  // Public zap specific
  zap?: PublicZap;
  getProfileData?: (profile: Kind0Event | null) => { name: string; picture: string };
}

export const TransactionCard: React.FC<TransactionCardProps> = ({
  amount,
  type,
  created_at,
  paid_at,
  transaction,
  isInvoiceExpired,
  isInvoicePaid,
  zap,
  getProfileData
}) => {
  const navigate = useNavigate();

  // Determine if this is a wallet transaction or public zap
  const isWalletTransaction = !!transaction;
  const isPublicZap = !!zap;

  // Get content/description
  const content = isWalletTransaction
    ? transaction.metadata?.zap_request?.content
    : zap?.content;
  
  const description = isWalletTransaction ? transaction.description : undefined;

  // Get note ID for navigation
  const getNoteId = (): string | null => {
    if (isWalletTransaction) {
      const eTag = transaction.metadata?.zap_request?.tags?.find((t: string[]) => t[0] === 'e');
      return eTag?.[1] || null;
    }
    return zap?.eventId || null;
  };

  const noteId = getNoteId();

  // Get status for wallet transactions
  const getTransactionStatus = () => {
    if (!isWalletTransaction || !isInvoiceExpired || !isInvoicePaid) return null;
    
    const isSettled = paid_at !== undefined || transaction.state === 'settled' || isInvoicePaid(transaction);
    const isExpired = transaction.state === 'expired' || isInvoiceExpired(transaction);
    const isFailed = transaction.state === 'failed';
    const isPending = !isSettled && !isExpired && !isFailed;

    if (isSettled) return null;

    if (isExpired) return { text: 'Expired', color: COLORS.ERROR };
    if (isFailed) return { text: 'Failed', color: COLORS.ERROR };
    if (isPending) return { text: 'Pending', color: COLORS.PENDING };
    return null;
  };

  const status = getTransactionStatus();

  // Handle note navigation
  const handleNoteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (noteId) {
      try {
        const nevent = nip19.noteEncode(noteId);
        navigate(`/note/${nevent}`);
      } catch (err) {
        console.error('Failed to encode note ID:', err);
      }
    }
  };

  // Get profile data for public zaps
  const getProfileInfo = () => {
    if (!isPublicZap || !getProfileData) return null;
    
    if (type === 'outgoing') {
      const recipientData = getProfileData(zap.recipientProfile);
      return { ...recipientData, label: 'To:' };
    } else {
      const payerData = getProfileData(zap.payerProfile);
      return { ...payerData, label: 'From:' };
    }
  };

  const profileInfo = getProfileInfo();

  return (
    <div
      style={{
        padding: '16px',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        marginBottom: '12px',
        background: 'var(--bg-secondary)'
      }}
    >
      {/* Timestamp and badges at top */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px'
        }}
      >
        {/* Timestamp */}
        {(paid_at || created_at) && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-tertiary)'
            }}
          >
            {formatTimestamp(paid_at || created_at)}
          </div>
        )}
        
        {/* Badges */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap',
            justifyContent: 'flex-end'
          }}
        >
          {/* Public/View badge */}
          {(isWalletTransaction && transaction.metadata?.zap_request) || (isPublicZap && noteId) ? (
            <span
              onClick={handleNoteClick}
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                background: COLORS.PRIMARY,
                color: COLORS.TEXT_WHITE,
                borderRadius: '4px',
                fontWeight: '500',
                cursor: noteId ? 'pointer' : 'default',
                transition: 'opacity 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (noteId) {
                  e.currentTarget.style.opacity = '0.8';
                }
              }}
              onMouseLeave={(e) => {
                if (noteId) {
                  e.currentTarget.style.opacity = '1';
                }
              }}
            >
              {isWalletTransaction ? 'Public' : 'View'}
            </span>
          ) : null}

          {/* Type badges */}
          {type === 'outgoing' && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                background: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
                fontWeight: '500'
              }}
            >
              Outgoing
            </span>
          )}
          {type === 'incoming' && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                background: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
                fontWeight: '500'
              }}
            >
              Incoming
            </span>
          )}
        </div>
      </div>
      
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '8px'
        }}
      >
        <div style={{ flex: isPublicZap ? 1 : undefined }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: isPublicZap ? '4px' : undefined
            }}
          >
            {amount
              ? `${isPublicZap ? (amount).toLocaleString() : (amount / LIGHTNING.MILLISATS_PER_SAT).toLocaleString()} sats`
              : 'Amount not specified'}
          </div>
          
          {/* Profile info for public zaps */}
          {profileInfo && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '4px'
              }}
            >
              <span>{profileInfo.label}</span>
              <img
                src={profileInfo.picture}
                alt={profileInfo.name}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
              <span>{profileInfo.name}</span>
            </div>
          )}

          {/* Content */}
          {content && (
            <div
              style={{
                fontSize: '18px',
                color: 'var(--text-primary)',
                marginTop: isPublicZap ? '6px' : '4px',
                borderRadius: isPublicZap ? '6px' : undefined
              }}
            >
              "{content}"
            </div>
          )}

          {/* Description (wallet transactions only) */}
          {description && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginTop: '4px'
              }}
            >
              {description}
            </div>
          )}

          {/* Fees (wallet transactions only) */}
          {isWalletTransaction && transaction.fees_paid !== undefined && transaction.fees_paid > 0 && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                marginTop: '4px'
              }}
            >
              Fees: {(transaction.fees_paid / LIGHTNING.MILLISATS_PER_SAT).toLocaleString()} sats
            </div>
          )}
        </div>

        {/* Right side: status only */}
        {status && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              textAlign: 'right'
            }}
          >
            <span style={{ color: status.color }}>{status.text}</span>
          </div>
        )}
      </div>
    </div>
  );
};
