import React from 'react';

interface ProfilePageProps {
  authState?: any;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ authState }) => {
  const isLoggedIn = authState?.isLoggedIn;
  const userProfile = authState?.userProfile;
  const displayName = authState?.displayName;
  const publicKey = authState?.publicKey;

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '20px', color: '#333' }}>
        Profile
      </h1>
      
      {isLoggedIn ? (
        <div>
          {/* User Profile Section */}
          <div style={{ 
            backgroundColor: '#f8f9fa', 
            padding: '20px', 
            borderRadius: '12px', 
            marginBottom: '30px',
            border: '1px solid #e9ecef'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: '#4a75ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '15px',
                color: 'white',
                fontSize: '24px',
                fontWeight: '600'
              }}>
                {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '5px', color: '#333' }}>
                  {displayName || 'Anonymous User'}
                </h2>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '0' }}>
                  PubPay User
                </p>
              </div>
            </div>
            
            {publicKey && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#666', display: 'block', marginBottom: '5px' }}>
                  Public Key
                </label>
                <code style={{ 
                  fontSize: '12px', 
                  backgroundColor: '#f1f3f4', 
                  padding: '8px', 
                  borderRadius: '4px',
                  display: 'block',
                  wordBreak: 'break-all',
                  color: '#333'
                }}>
                  {publicKey}
                </code>
              </div>
            )}
          </div>

          {/* Stats Section */}
          <div style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '15px', color: '#333' }}>
              Activity Stats
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
              <div style={{ 
                backgroundColor: '#fff', 
                padding: '20px', 
                borderRadius: '8px',
                border: '1px solid #e9ecef',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', fontWeight: '600', color: '#4a75ff', marginBottom: '5px' }}>
                  0
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  Paynotes Sent
                </div>
              </div>
              <div style={{ 
                backgroundColor: '#fff', 
                padding: '20px', 
                borderRadius: '8px',
                border: '1px solid #e9ecef',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', fontWeight: '600', color: '#4a75ff', marginBottom: '5px' }}>
                  0
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  Paynotes Received
                </div>
              </div>
              <div style={{ 
                backgroundColor: '#fff', 
                padding: '20px', 
                borderRadius: '8px',
                border: '1px solid #e9ecef',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '24px', fontWeight: '600', color: '#4a75ff', marginBottom: '5px' }}>
                  0
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  Total Transactions
                </div>
              </div>
            </div>
          </div>

          {/* Settings Section */}
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '15px', color: '#333' }}>
              Account Settings
            </h2>
            <div style={{ 
              backgroundColor: '#fff', 
              padding: '20px', 
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#333', display: 'block', marginBottom: '5px' }}>
                  Display Name
                </label>
                <input 
                  type="text" 
                  defaultValue={displayName || ''}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                  placeholder="Enter your display name"
                />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#333', display: 'block', marginBottom: '5px' }}>
                  Bio
                </label>
                <textarea 
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                  placeholder="Tell us about yourself..."
                />
              </div>
              <button style={{
                backgroundColor: '#4a75ff',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '40px', 
          borderRadius: '12px', 
          textAlign: 'center',
          border: '1px solid #e9ecef'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '15px', color: '#333' }}>
            Not Logged In
          </h2>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>
            Please log in to view your profile and manage your account settings.
          </p>
          <button style={{
            backgroundColor: '#4a75ff',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer'
          }}>
            Log In
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;