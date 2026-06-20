import io
import logging
import os
from typing import Dict, Any, List, Optional

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib import rcParams

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_CENTER, TA_LEFT

logger = logging.getLogger(__name__)


def _find_chinese_font():
    """查找系统中的中文字体"""
    font_candidates = [
        '/System/Library/Fonts/PingFang.ttc',
        '/System/Library/Fonts/STHeiti Medium.ttc',
        '/System/Library/Fonts/STHeiti Light.ttc',
        '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
        '/usr/share/fonts/truetype/arphic/uming.ttc',
        '/usr/share/fonts/truetype/arphic/ukai.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
        'C:/Windows/Fonts/msyh.ttc',
        'C:/Windows/Fonts/simhei.ttf',
    ]

    for font_path in font_candidates:
        if os.path.exists(font_path):
            return font_path

    for font in fm.findSystemFonts():
        if any(name in font.lower() for name in ['hei', 'song', 'fang', 'kai', 'noto', 'cjk', 'chinese', 'wqy', 'pingfang']):
            return font

    return None


CHINESE_FONT_PATH = _find_chinese_font()

COLORS = [
    '#1976d2',
    '#388e3c',
    '#d32f2f',
    '#f57c00',
    '#7b1fa2',
]


def _setup_matplotlib_font():
    """配置 matplotlib 的中文字体"""
    if CHINESE_FONT_PATH:
        try:
            font_name = fm.FontProperties(fname=CHINESE_FONT_PATH).get_name()
            rcParams['font.sans-serif'] = [font_name] + rcParams['font.sans-serif']
            rcParams['axes.unicode_minus'] = False
            return True
        except Exception:
            pass
    rcParams['axes.unicode_minus'] = False
    return False


_setup_matplotlib_font()


def _register_reportlab_font():
    """注册 reportlab 的中文字体"""
    if CHINESE_FONT_PATH:
        try:
            if CHINESE_FONT_PATH.endswith('.ttc'):
                pdfmetrics.registerFont(TTFont('ChineseFont', CHINESE_FONT_PATH, subfontIndex=0))
            else:
                pdfmetrics.registerFont(TTFont('ChineseFont', CHINESE_FONT_PATH))
            return True
        except Exception as e:
            logger.warning(f"Failed to register Chinese font: {e}")
    return False


HAS_CHINESE_FONT = _register_reportlab_font()


def create_accuracy_chart(accuracy_data: Dict[str, Any]) -> bytes:
    """生成精度收敛对比图"""
    fig, ax = plt.subplots(figsize=(10, 5), dpi=100)

    for i, exp in enumerate(accuracy_data.get('experiments', [])):
        data_points = exp.get('data', [])
        if not data_points:
            continue
        rounds = [d['round'] for d in data_points]
        accuracies = [d['accuracy'] for d in data_points]
        color = COLORS[i % len(COLORS)]
        ax.plot(rounds, accuracies, label=exp['experiment_name'],
                color=color, linewidth=2.5, marker='o', markersize=4)

    ax.set_xlabel('通信轮次', fontsize=12)
    ax.set_ylabel('全局精度 (%)', fontsize=12)
    ax.set_title('精度收敛对比', fontsize=14, fontweight='bold')
    ax.legend(loc='lower right', fontsize=10)
    ax.grid(True, alpha=0.3)
    ax.set_ylim(0, 100)

    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def create_communication_chart(comm_data: Dict[str, Any]) -> bytes:
    """生成通信效率对比柱状图"""
    fig, ax = plt.subplots(figsize=(10, 5), dpi=100)

    names = comm_data.get('experiment_names', [])
    avg_comm = comm_data.get('avg_communication_per_round', [])
    total_comm = comm_data.get('total_communication', [])

    x = range(len(names))
    width = 0.35

    bars1 = ax.bar([i - width/2 for i in x], avg_comm, width,
                   label='单轮平均通信量 (MB)', color='#1976d2', alpha=0.8)
    bars2 = ax.bar([i + width/2 for i in x], total_comm, width,
                   label='总通信量 (MB)', color='#388e3c', alpha=0.8)

    ax.set_xlabel('实验', fontsize=12)
    ax.set_ylabel('通信量 (MB)', fontsize=12)
    ax.set_title('通信效率对比', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(names, fontsize=10, rotation=15, ha='right')
    ax.legend(loc='upper right', fontsize=10)
    ax.grid(True, alpha=0.3, axis='y')

    for bar in bars1:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.1,
                f'{height:.1f}', ha='center', va='bottom', fontsize=9)
    for bar in bars2:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.1,
                f'{height:.1f}', ha='center', va='bottom', fontsize=9)

    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def create_privacy_chart(privacy_data: Dict[str, Any]) -> Optional[bytes]:
    """生成隐私开销对比图"""
    if not privacy_data or not privacy_data.get('experiments'):
        return None

    fig, ax = plt.subplots(figsize=(10, 5), dpi=100)

    for i, exp in enumerate(privacy_data.get('experiments', [])):
        data_points = exp.get('data', [])
        if not data_points:
            continue
        rounds = [d['round'] for d in data_points]
        epsilons = [d['epsilon'] for d in data_points]
        color = COLORS[i % len(COLORS)]
        ax.plot(rounds, epsilons, label=exp['experiment_name'],
                color=color, linewidth=2.5, marker='s', markersize=4)

        if exp.get('target_epsilon'):
            ax.axhline(y=exp['target_epsilon'], color=color,
                       linestyle='--', alpha=0.5, linewidth=1.5)

    ax.set_xlabel('通信轮次', fontsize=12)
    ax.set_ylabel('累计 Epsilon 消耗', fontsize=12)
    ax.set_title('隐私开销对比', fontsize=14, fontweight='bold')
    ax.legend(loc='upper left', fontsize=10)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def generate_report_pdf(report_data: Dict[str, Any]) -> bytes:
    """生成完整的报告PDF"""
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )

    styles = getSampleStyleSheet()
    font_name = 'ChineseFont' if HAS_CHINESE_FONT else 'Helvetica'

    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontName=font_name,
        fontSize=18,
        alignment=TA_CENTER,
        spaceAfter=20,
        textColor=colors.HexColor('#1976d2')
    )

    section_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontName=font_name,
        fontSize=14,
        alignment=TA_LEFT,
        spaceBefore=15,
        spaceAfter=10,
        textColor=colors.HexColor('#333333'),
        borderPadding=(0, 0, 5, 0),
        borderWidth=0,
        borderColor=colors.HexColor('#1976d2'),
    )

    body_style = ParagraphStyle(
        'BodyText',
        parent=styles['BodyText'],
        fontName=font_name,
        fontSize=10,
        leading=14,
        firstLineIndent=20,
    )

    normal_style = ParagraphStyle(
        'NormalText',
        parent=styles['Normal'],
        fontName=font_name,
        fontSize=10,
        leading=14,
    )

    story = []

    story.append(Paragraph(report_data.get('title', '联邦学习实验对比报告'), title_style))
    story.append(Spacer(1, 10))

    overview_data = report_data.get('overview_table', [])
    if overview_data:
        story.append(Paragraph('一、实验概况', section_style))

        table_data = [
            ['指标'] + [exp['experiment_name'] for exp in overview_data]
        ]

        rows = [
            ('实验ID', 'experiment_id', lambda v: str(v)),
            ('算法', 'algorithm', lambda v: v.upper()),
            ('数据集', 'dataset', lambda v: v.upper()),
            ('客户端数', 'num_clients', lambda v: str(v)),
            ('轮次数', 'num_rounds', lambda v: str(v)),
            ('最终精度', 'final_accuracy', lambda v: f'{v*100:.2f}%' if v is not None else '-'),
            ('总通信量', 'total_communication', lambda v: f'{v/1024/1024:.2f} MB'),
            ('耗时', 'duration_seconds', lambda v: f'{v:.1f} 秒' if v is not None else '-'),
            ('收敛轮次', 'convergence_round', lambda v: f'第 {v} 轮' if v else '未收敛'),
            ('单轮平均精度提升', 'avg_round_accuracy_improvement',
             lambda v: f'{v*100:.3f}%' if v is not None else '-'),
            ('精度方差', 'accuracy_variance',
             lambda v: f'{v:.6f}' if v is not None else '-'),
        ]

        for label, key, formatter in rows:
            row = [label]
            for exp in overview_data:
                row.append(formatter(exp.get(key)))
            table_data.append(row)

        col_widths = [3*cm] + [3.5*cm] * len(overview_data)
        table = Table(table_data, colWidths=col_widths, repeatRows=1)

        table_style = TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1976d2')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSTYLE', (0, 0), (-1, 0), 'bold'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
            ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#f5f5f5')),
            ('FONTSTYLE', (0, 1), (0, -1), 'bold'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ])

        for i in range(1, len(table_data)):
            if i % 2 == 0:
                table_style.add('BACKGROUND', (1, i), (-1, i), colors.HexColor('#fafafa'))

        table.setStyle(table_style)
        story.append(table)
        story.append(Spacer(1, 15))

    accuracy_data = report_data.get('accuracy_chart_data')
    if accuracy_data:
        story.append(Paragraph('二、精度收敛对比', section_style))
        try:
            chart_bytes = create_accuracy_chart(accuracy_data)
            img = Image(io.BytesIO(chart_bytes), width=16*cm, height=8*cm)
            story.append(img)
        except Exception as e:
            logger.error(f"Failed to generate accuracy chart: {e}")
            story.append(Paragraph("（图表生成失败）", normal_style))
        story.append(Spacer(1, 10))

    comm_data = report_data.get('communication_chart_data')
    if comm_data:
        story.append(Paragraph('三、通信效率对比', section_style))
        try:
            chart_bytes = create_communication_chart(comm_data)
            img = Image(io.BytesIO(chart_bytes), width=16*cm, height=8*cm)
            story.append(img)
        except Exception as e:
            logger.error(f"Failed to generate communication chart: {e}")
            story.append(Paragraph("（图表生成失败）", normal_style))
        story.append(Spacer(1, 10))

    privacy_data = report_data.get('privacy_chart_data')
    if privacy_data and privacy_data.get('experiments'):
        story.append(Paragraph('四、隐私开销对比', section_style))
        try:
            chart_bytes = create_privacy_chart(privacy_data)
            if chart_bytes:
                img = Image(io.BytesIO(chart_bytes), width=16*cm, height=8*cm)
                story.append(img)
        except Exception as e:
            logger.error(f"Failed to generate privacy chart: {e}")
            story.append(Paragraph("（图表生成失败）", normal_style))
        story.append(Spacer(1, 10))

    conclusion = report_data.get('conclusion_summary', '')
    if conclusion:
        story.append(Paragraph('五、结论摘要', section_style))
        story.append(Paragraph(conclusion, body_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
