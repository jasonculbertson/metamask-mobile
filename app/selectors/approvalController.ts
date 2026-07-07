import { createSelector } from 'reselect';
import { RootState } from '../reducers';
import { ApprovalControllerState } from '@metamask/approval-controller';

const selectApprovalControllerState = (state: RootState) =>
  state?.engine?.backgroundState?.ApprovalController;

export const selectPendingApprovals = createSelector(
  selectApprovalControllerState,
  (approvalControllerState: ApprovalControllerState) =>
    approvalControllerState?.pendingApprovals,
);

export const selectApprovalFlows = createSelector(
  selectApprovalControllerState,
  (approvalControllerState: ApprovalControllerState) =>
    approvalControllerState?.approvalFlows,
);

/**
 * Memoized projection of the pending approvals map to just its IDs.
 *
 * Consumers that only need the set of pending approval IDs (rather than the
 * full approvals map) should use this selector with default `useSelector`
 * equality instead of `selectPendingApprovals` + a deep-equality comparator.
 * Reselect returns the same array reference as long as `pendingApprovals`
 * itself hasn't changed, so no custom equality function is needed.
 */
export const selectPendingApprovalIds = createSelector(
  selectPendingApprovals,
  (pendingApprovals) => Object.keys(pendingApprovals ?? {}),
);
