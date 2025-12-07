import React from 'react';

interface ActivityStats {
  paynotesCreated: number;
  pubpaysReceived: number;
  zapsReceived: number;
}

interface ProfileStatsProps {
  activityStats: ActivityStats;
  activityLoading: boolean;
}

export const ProfileStats: React.FC<ProfileStatsProps> = ({
  activityStats,
  activityLoading
}) => {
  return (
    <div className="profileStatsSection">
      <h2 className="profileStatsTitle">Activity Stats</h2>
      <div className="profileStatsGrid">
        <div className="profileStatCard">
          <div className="profileStatValue" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '32px' }}>
            {activityLoading ? (
              <div className="skeleton skeleton-value" style={{ width: '50px', height: '28px' }}></div>
            ) : (
              activityStats.paynotesCreated
            )}
          </div>
          <div className="profileStatLabel">Paynotes Created</div>
        </div>
        <div className="profileStatCard">
          <div className="profileStatValue" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '32px' }}>
            {activityLoading ? (
              <div className="skeleton skeleton-value" style={{ width: '50px', height: '28px' }}></div>
            ) : (
              activityStats.pubpaysReceived
            )}
          </div>
          <div className="profileStatLabel">PubPays Received</div>
        </div>
        <div className="profileStatCard">
          <div className="profileStatValue" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '32px' }}>
            {activityLoading ? (
              <div className="skeleton skeleton-value" style={{ width: '50px', height: '28px' }}></div>
            ) : (
              activityStats.zapsReceived
            )}
          </div>
          <div className="profileStatLabel">Zaps Received</div>
        </div>
      </div>
    </div>
  );
};

