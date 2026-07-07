import { ApprovalControllerState } from '@metamask/approval-controller';
import {
  selectApprovalFlows,
  selectPendingApprovals,
  selectPendingApprovalIds,
} from './approvalController';

const PENDING_APPROVALS_MOCK: ApprovalControllerState['pendingApprovals'] = {
  testId1: {
    id: 'testId1',
    origin: 'testOrigin1',
    type: 'eth_signTypedData',
    time: 123456789,
    expectsResult: false,
    requestData: {
      test: 'value',
      test2: 'value2',
    },
    requestState: {},
  },
  testId2: {
    id: 'testId2',
    origin: 'testOrigin2',
    type: 'transaction',
    time: 123456780,
    expectsResult: true,
    requestData: {
      test3: 'value2',
    },
    requestState: {
      test4: 'value3',
    },
  },
};

const APPROVAL_FLOWS_MOCK: ApprovalControllerState['approvalFlows'] = [
  {
    id: 'testId1',
    loadingText: 'testLoadingText1',
  },
  {
    id: 'testId2',
    loadingText: 'testLoadingText2',
  },
];

describe('Approval Controller Selectors', () => {
  describe('selectPendingApprovals', () => {
    it('returns the pending approvals object from the approval controller', () => {
      expect(
        selectPendingApprovals({
          engine: {
            backgroundState: {
              ApprovalController: {
                pendingApprovals: PENDING_APPROVALS_MOCK,
              },
            },
          },
          // TODO: Replace "any" with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toEqual(PENDING_APPROVALS_MOCK);
    });
  });

  describe('selectApprovalFlows', () => {
    it('returns the approvals flow array from the approval controller', () => {
      expect(
        selectApprovalFlows({
          engine: {
            backgroundState: {
              ApprovalController: {
                approvalFlows: APPROVAL_FLOWS_MOCK,
              },
            },
          },
          // TODO: Replace "any" with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toEqual(APPROVAL_FLOWS_MOCK);
    });
  });

  describe('selectPendingApprovalIds', () => {
    const buildState = (
      pendingApprovals: ApprovalControllerState['pendingApprovals'],
    ) =>
      ({
        engine: {
          backgroundState: {
            ApprovalController: {
              pendingApprovals,
            },
          },
        },
        // TODO: Replace "any" with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

    it('returns the keys of the pending approvals object', () => {
      expect(selectPendingApprovalIds(buildState(PENDING_APPROVALS_MOCK))).toEqual(
        Object.keys(PENDING_APPROVALS_MOCK),
      );
    });

    it('returns an empty array when there are no pending approvals', () => {
      expect(selectPendingApprovalIds(buildState({}))).toEqual([]);
    });

    it('returns a stable array reference when the underlying approvals are unchanged', () => {
      const state = buildState(PENDING_APPROVALS_MOCK);

      const firstResult = selectPendingApprovalIds(state);
      const secondResult = selectPendingApprovalIds(state);

      expect(secondResult).toBe(firstResult);
    });

    it('returns a new array reference when the underlying approvals change', () => {
      const firstResult = selectPendingApprovalIds(
        buildState({ testId1: PENDING_APPROVALS_MOCK.testId1 }),
      );
      const secondResult = selectPendingApprovalIds(
        buildState(PENDING_APPROVALS_MOCK),
      );

      expect(secondResult).not.toBe(firstResult);
    });
  });
});
