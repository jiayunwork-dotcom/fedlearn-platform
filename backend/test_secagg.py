import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from app.core.secure_aggregation import ShamirSecretSharing, SecureAggregator


def test_shamir_basic():
    print("=" * 60)
    print("Test 1: Shamir秘密共享基本功能")
    print("=" * 60)

    sss = ShamirSecretSharing()
    secret = 123.456
    n = 10
    t = 5

    shares = sss.split(secret, n, t)
    print(f"原始秘密值: {secret}")
    print(f"分片数量: {len(shares)}, 阈值: {t}")

    test_shares = shares[:t]
    reconstructed = sss.reconstruct(test_shares)
    print(f"用{t}个分片恢复的值: {reconstructed}")
    print(f"误差: {abs(reconstructed - secret)}")
    print(f"是否正确: {abs(reconstructed - secret) < 0.01}")

    assert abs(reconstructed - secret) < 0.01, "Shamir恢复失败"
    print("✓ Shamir秘密共享测试通过\n")


def test_shamir_dropout():
    print("=" * 60)
    print("Test 2: Shamir秘密共享 - 部分分片也能恢复")
    print("=" * 60)

    sss = ShamirSecretSharing()
    secret = 999.999
    n = 10
    t = 3

    shares = sss.split(secret, n, t)

    import random
    selected = random.sample(shares, t + 2)
    reconstructed = sss.reconstruct(selected)
    print(f"用{t+2}个随机分片恢复的值: {reconstructed}")
    print(f"误差: {abs(reconstructed - secret)}")
    assert abs(reconstructed - secret) < 0.01, "Shamir随机分片恢复失败"
    print("✓ 部分分片恢复测试通过\n")


def test_mask_cancellation():
    print("=" * 60)
    print("Test 3: 成对掩码抵消验证")
    print("=" * 60)

    n_clients = 10
    threshold = 5
    sa = SecureAggregator(n_clients, threshold, dropout_rate=0.0, mask_scale=1e-5)

    raw_updates = {}
    for i in range(n_clients):
        raw_updates[i] = [
            np.random.randn(20, 20).astype(np.float32) * 0.1,
            np.random.randn(10).astype(np.float32) * 0.05
        ]

    result = sa.verify_cancellation(raw_updates)
    print(f"客户端数量: {result['num_clients']}")
    print(f"总掩码和的范数: {result['total_mask_norm']:.10f}")
    print(f"平均更新范数: {result['avg_update_norm']:.6f}")
    print(f"相对抵消误差: {result['relative_mask_cancellation_error']:.10f}")
    print(f"抵消验证通过: {result['cancellation_verified']}")

    assert result['cancellation_verified'], "掩码抵消失败"
    print("✓ 掩码抵消测试通过\n")


def test_secure_aggregation_full():
    print("=" * 60)
    print("Test 4: 完整安全聚合 (无掉线)")
    print("=" * 60)

    n_clients = 10
    threshold = 6
    sa = SecureAggregator(n_clients, threshold, dropout_rate=0.0, mask_scale=1e-6)

    raw_updates = {}
    for i in range(n_clients):
        raw_updates[i] = [np.random.randn(50).astype(np.float32) * 0.1]

    agg_result, info = sa.secure_aggregate(raw_updates)

    true_avg = np.zeros_like(list(raw_updates.values())[0][0])
    for u in raw_updates.values():
        true_avg += u[0]
    true_avg /= n_clients

    agg_result_flat = agg_result[0]
    error = np.linalg.norm(agg_result_flat - true_avg)
    rel_error = error / np.linalg.norm(true_avg)

    print(f"客户端数: {info['total_clients']}, 存活: {info['surviving_clients']}, 掉线: {info['dropped_clients']}")
    print(f"方法: {info['method']}")
    print(f"绝对误差: {error:.8f}")
    print(f"相对误差: {rel_error:.8f}")
    print(f"是否在容忍范围内: {info['error_within_tolerance']}")

    assert info['error_within_tolerance'], "安全聚合结果偏差太大"
    print("✓ 完整安全聚合测试通过\n")


def test_secure_aggregation_with_dropout():
    print("=" * 60)
    print("Test 5: 安全聚合 - 有掉线场景")
    print("=" * 60)

    n_clients = 10
    threshold = 6
    sa = SecureAggregator(n_clients, threshold, dropout_rate=0.3, mask_scale=1e-6)

    raw_updates = {}
    weights = {}
    for i in range(n_clients):
        raw_updates[i] = [np.random.randn(30).astype(np.float32) * 0.1]
        weights[i] = float(i + 1)

    agg_result, info = sa.secure_aggregate(raw_updates, weights)

    surviving = info['surviving_ids']
    print(f"客户端数: {info['total_clients']}")
    print(f"存活: {info['surviving_clients']} - {surviving}")
    print(f"掉线: {info['dropped_clients']} - {info['dropped_ids']}")
    print(f"Shamir阈值: {info['shamir_threshold']}")

    true_avg = np.zeros_like(list(raw_updates.values())[0][0])
    total_w = 0
    for cid in surviving:
        w = weights[cid]
        true_avg += w * raw_updates[cid][0]
        total_w += w
    true_avg /= total_w

    error = np.linalg.norm(agg_result[0] - true_avg)
    rel_error = error / np.linalg.norm(true_avg)

    print(f"绝对误差: {error:.8f}")
    print(f"相对误差: {rel_error:.8f}")
    print(f"是否在容忍范围内: {info['error_within_tolerance']}")

    assert info['error_within_tolerance'], "掉线场景下安全聚合偏差太大"
    print("✓ 掉线场景安全聚合测试通过\n")


def test_weighted_aggregation():
    print("=" * 60)
    print("Test 6: 加权安全聚合验证")
    print("=" * 60)

    n_clients = 5
    threshold = 3
    sa = SecureAggregator(n_clients, threshold, dropout_rate=0.0, mask_scale=1e-7)

    raw_updates = {}
    weights = {}
    for i in range(n_clients):
        raw_updates[i] = [np.random.randn(20, 20).astype(np.float32) * 0.1]
        weights[i] = float(1 + i * 2)

    agg_result, info = sa.secure_aggregate(raw_updates, weights)

    total_w = sum(weights.values())
    true_weighted_avg = np.zeros_like(list(raw_updates.values())[0][0])
    for cid in raw_updates:
        w = weights[cid] / total_w
        true_weighted_avg += w * raw_updates[cid][0]

    error = np.linalg.norm(agg_result[0] - true_weighted_avg)
    rel_error = error / np.linalg.norm(true_weighted_avg)

    print(f"权重: {weights}")
    print(f"相对误差: {rel_error:.8f}")

    assert rel_error < 0.01, "加权安全聚合偏差太大"
    print("✓ 加权安全聚合测试通过\n")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  安全聚合模块验证测试")
    print("=" * 60 + "\n")

    try:
        test_shamir_basic()
        test_shamir_dropout()
        test_mask_cancellation()
        test_secure_aggregation_full()
        test_secure_aggregation_with_dropout()
        test_weighted_aggregation()

        print("=" * 60)
        print("🎉 所有测试全部通过！")
        print("=" * 60)
    except AssertionError as e:
        print(f"\n❌ 测试失败: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
