import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
import numpy as np

from app import models

logger = logging.getLogger(__name__)


def calculate_statistics(
    rounds_data: List[models.RoundResult],
    num_rounds: int
) -> Dict[str, Any]:
    """计算实验的统计指标"""
    if not rounds_data:
        return {
            "avg_round_accuracy_improvement": None,
            "accuracy_variance": None,
            "convergence_round": None
        }

    accuracies = [r.global_accuracy for r in rounds_data if r.global_accuracy is not None]

    if len(accuracies) < 2:
        return {
            "avg_round_accuracy_improvement": None,
            "accuracy_variance": None,
            "convergence_round": None
        }

    improvements = []
    for i in range(1, len(accuracies)):
        improvements.append(max(0, accuracies[i] - accuracies[i-1]))

    avg_improvement = np.mean(improvements) if improvements else 0.0

    accuracy_variance = float(np.var(accuracies)) if len(accuracies) > 1 else 0.0

    convergence_round = None
    for i, acc in enumerate(accuracies):
        if acc >= 0.9:
            convergence_round = rounds_data[i].round_num
            break

    return {
        "avg_round_accuracy_improvement": float(avg_improvement),
        "accuracy_variance": accuracy_variance,
        "convergence_round": convergence_round
    }


def generate_overview_table(
    experiments: List[models.Experiment],
    db: Session
) -> List[Dict[str, Any]]:
    """生成实验概况表格数据"""
    overview = []

    for exp in experiments:
        rounds = (
            db.query(models.RoundResult)
            .filter(models.RoundResult.experiment_id == exp.id)
            .order_by(models.RoundResult.round_num)
            .all()
        )

        stats = calculate_statistics(rounds, exp.num_rounds)

        duration = None
        if exp.started_at and exp.completed_at:
            duration = (exp.completed_at - exp.started_at).total_seconds()

        overview.append({
            "experiment_id": exp.id,
            "experiment_name": exp.name,
            "algorithm": exp.algorithm,
            "dataset": exp.dataset_name,
            "num_clients": exp.num_clients,
            "num_rounds": exp.num_rounds,
            "final_accuracy": exp.final_accuracy,
            "total_communication": exp.total_communication or 0.0,
            "duration_seconds": duration,
            "avg_round_accuracy_improvement": stats["avg_round_accuracy_improvement"],
            "accuracy_variance": stats["accuracy_variance"],
            "convergence_round": stats["convergence_round"],
            "differential_privacy": exp.differential_privacy,
            "non_iid_mode": exp.non_iid_mode,
            "non_iid_alpha": exp.non_iid_alpha
        })

    return overview


def generate_accuracy_chart_data(
    experiments: List[models.Experiment],
    db: Session
) -> Dict[str, Any]:
    """生成精度收敛对比图数据"""
    all_rounds = set()
    exp_data = []

    for exp in experiments:
        rounds = (
            db.query(models.RoundResult)
            .filter(models.RoundResult.experiment_id == exp.id)
            .order_by(models.RoundResult.round_num)
            .all()
        )

        accuracies = []
        for r in rounds:
            if r.global_accuracy is not None:
                all_rounds.add(r.round_num)
                accuracies.append({
                    "round": r.round_num,
                    "accuracy": r.global_accuracy * 100
                })

        exp_data.append({
            "experiment_id": exp.id,
            "experiment_name": exp.name,
            "data": accuracies
        })

    sorted_rounds = sorted(list(all_rounds))

    return {
        "rounds": sorted_rounds,
        "experiments": exp_data
    }


def generate_communication_chart_data(
    experiments: List[models.Experiment],
    db: Session
) -> Dict[str, Any]:
    """生成通信效率对比图数据"""
    experiment_names = []
    avg_comm_per_round = []
    total_comm = []

    for exp in experiments:
        rounds = (
            db.query(models.RoundResult)
            .filter(models.RoundResult.experiment_id == exp.id)
            .all()
        )

        total_comm_bytes = exp.total_communication or 0.0
        num_rounds = len(rounds) if rounds else 1
        avg_bytes = total_comm_bytes / num_rounds

        experiment_names.append(exp.name)
        avg_comm_per_round.append(avg_bytes / 1024 / 1024)
        total_comm.append(total_comm_bytes / 1024 / 1024)

    return {
        "experiment_names": experiment_names,
        "avg_communication_per_round": avg_comm_per_round,
        "total_communication": total_comm
    }


def generate_privacy_chart_data(
    experiments: List[models.Experiment],
    db: Session
) -> Optional[Dict[str, Any]]:
    """生成隐私开销对比图数据（仅当有实验开启差分隐私时）"""
    dp_experiments = [exp for exp in experiments if exp.differential_privacy]

    if not dp_experiments:
        return None

    all_rounds = set()
    exp_data = []

    for exp in dp_experiments:
        rounds = (
            db.query(models.RoundResult)
            .filter(models.RoundResult.experiment_id == exp.id)
            .order_by(models.RoundResult.round_num)
            .all()
        )

        epsilon_history = []
        cumulative_epsilon = 0.0
        for r in rounds:
            cumulative_epsilon += r.epsilon_consumed or 0.0
            all_rounds.add(r.round_num)
            epsilon_history.append({
                "round": r.round_num,
                "epsilon": cumulative_epsilon
            })

        exp_data.append({
            "experiment_id": exp.id,
            "experiment_name": exp.name,
            "target_epsilon": exp.dp_target_epsilon,
            "data": epsilon_history
        })

    sorted_rounds = sorted(list(all_rounds))

    return {
        "rounds": sorted_rounds,
        "experiments": exp_data
    }


def generate_conclusion_summary(
    overview_data: List[Dict[str, Any]],
    privacy_data: Optional[Dict[str, Any]]
) -> str:
    """基于规则生成结论摘要"""
    if not overview_data:
        return "无实验数据可供分析。"

    completed_exps = [e for e in overview_data if e["final_accuracy"] is not None]

    if not completed_exps:
        return "选中的实验均未完成，无法生成有效结论。"

    parts = []

    best_acc_exp = max(completed_exps, key=lambda x: x["final_accuracy"])
    best_acc_pct = best_acc_exp["final_accuracy"] * 100
    parts.append(f"在所有已完成的 {len(completed_exps)} 个实验中，"
                 f"实验「{best_acc_exp['experiment_name']}」取得了最高的最终精度，"
                 f"达到 {best_acc_pct:.2f}%。")

    convergence_exps = [e for e in completed_exps if e["convergence_round"] is not None]
    if convergence_exps:
        fastest_exp = min(convergence_exps, key=lambda x: x["convergence_round"])
        parts.append(f"收敛速度方面，实验「{fastest_exp['experiment_name']}」"
                     f"在第 {fastest_exp['convergence_round']} 轮时精度首次突破90%，"
                     f"是收敛最快的实验。")

    lowest_comm_exp = min(completed_exps, key=lambda x: x["total_communication"])
    comm_mb = lowest_comm_exp["total_communication"] / 1024 / 1024
    parts.append(f"通信开销方面，实验「{lowest_comm_exp['experiment_name']}」"
                 f"总通信量最低，为 {comm_mb:.2f} MB。")

    iid_exps = [e for e in completed_exps if e["non_iid_mode"] == "iid"]
    non_iid_exps = [e for e in completed_exps if e["non_iid_mode"] != "iid"]

    if iid_exps and non_iid_exps:
        avg_iid_acc = np.mean([e["final_accuracy"] for e in iid_exps])
        avg_non_iid_acc = np.mean([e["final_accuracy"] for e in non_iid_exps])
        acc_drop = (avg_iid_acc - avg_non_iid_acc) * 100
        drop_pct = (acc_drop / (avg_iid_acc * 100)) * 100 if avg_iid_acc > 0 else 0

        if acc_drop > 0:
            parts.append(f"非IID数据对精度有显著影响："
                         f"IID设置下平均精度为 {avg_iid_acc * 100:.2f}%，"
                         f"而非IID设置下平均精度为 {avg_non_iid_acc * 100:.2f}%，"
                         f"下降了 {acc_drop:.2f} 个百分点（降幅约 {drop_pct:.1f}%）。")
        else:
            parts.append("在本次对比中，非IID数据设置并未导致精度下降，"
                         "可能得益于特定算法对数据异质性的鲁棒性。")

    if privacy_data and privacy_data.get("experiments"):
        dp_exp_count = len(privacy_data["experiments"])
        parts.append(f"本次对比中有 {dp_exp_count} 个实验开启了差分隐私保护，"
                     f"在提供隐私保障的同时需关注精度损失。")

    if len(completed_exps) >= 2:
        sorted_by_acc = sorted(completed_exps, key=lambda x: x["final_accuracy"], reverse=True)
        acc_gap = (sorted_by_acc[0]["final_accuracy"] - sorted_by_acc[-1]["final_accuracy"]) * 100
        if acc_gap > 1:
            parts.append(f"各实验之间的最终精度差距为 {acc_gap:.2f} 个百分点，"
                         f"表明不同配置对模型性能有较大影响。")
        else:
            parts.append(f"各实验之间的最终精度差距较小（{acc_gap:.2f} 个百分点），"
                         f"说明这些配置在精度上表现相近。")

    return " ".join(parts)


def generate_report(experiment_ids: List[int], db: Session) -> Dict[str, Any]:
    """生成完整报告数据"""
    experiments = []
    for exp_id in experiment_ids:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == exp_id)
            .first()
        )
        if exp:
            experiments.append(exp)

    if not experiments:
        raise ValueError("未找到指定的实验")

    overview_table = generate_overview_table(experiments, db)
    accuracy_chart_data = generate_accuracy_chart_data(experiments, db)
    communication_chart_data = generate_communication_chart_data(experiments, db)
    privacy_chart_data = generate_privacy_chart_data(experiments, db)
    conclusion_summary = generate_conclusion_summary(overview_table, privacy_chart_data)

    return {
        "title": f"联邦学习实验对比报告（{len(experiments)}个实验）",
        "experiment_ids": [exp.id for exp in experiments],
        "overview_table": overview_table,
        "accuracy_chart_data": accuracy_chart_data,
        "communication_chart_data": communication_chart_data,
        "privacy_chart_data": privacy_chart_data,
        "conclusion_summary": conclusion_summary
    }
