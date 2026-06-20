import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
from typing import List, Optional
import io

from app.database import get_db
from app import models, schemas
from app.services.report_service import generate_report
from app.services.pdf_service import generate_report_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("", response_model=schemas.ReportListResponse)
def list_reports(
    search: Optional[str] = None,
    sort_by: Optional[str] = "created_at_desc",
    db: Session = Depends(get_db)
):
    try:
        query = db.query(models.Report)

        if search:
            query = query.filter(models.Report.title.ilike(f"%{search}%"))

        if sort_by == "created_at_asc":
            query = query.order_by(asc(models.Report.created_at))
        else:
            query = query.order_by(desc(models.Report.created_at))

        total = query.count()
        reports = query.all()

        return schemas.ReportListResponse(
            total=total,
            reports=reports
        )
    except Exception as e:
        logger.error(f"Failed to list reports: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"获取报告列表失败: {str(e)}"
        )


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    try:
        report = (
            db.query(models.Report)
            .filter(models.Report.id == report_id)
            .first()
        )
        if not report:
            raise HTTPException(status_code=404, detail="报告不存在")

        db.delete(report)
        db.commit()

        return {"message": "报告已删除"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete report {report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"删除报告失败: {str(e)}"
        )


@router.post("/generate", response_model=schemas.ReportResponse)
def create_report(
    request: schemas.GenerateReportRequest,
    db: Session = Depends(get_db)
):
    try:
        experiment_ids = request.experiment_ids

        if len(experiment_ids) < 2 or len(experiment_ids) > 5:
            raise HTTPException(
                status_code=400,
                detail="请选择2-5个已完成的实验生成报告"
            )

        for exp_id in experiment_ids:
            exp = (
                db.query(models.Experiment)
                .filter(models.Experiment.id == exp_id)
                .first()
            )
            if not exp:
                raise HTTPException(
                    status_code=404,
                    detail=f"实验 {exp_id} 不存在"
                )
            if exp.status != "completed":
                raise HTTPException(
                    status_code=400,
                    detail=f"实验「{exp.name}」状态为「{exp.status}」，请选择已完成的实验"
                )

        report_data = generate_report(experiment_ids, db)

        pdf_bytes = generate_report_pdf(report_data)
        pdf_size = len(pdf_bytes)

        report = models.Report(
            title=report_data["title"],
            experiment_ids=report_data["experiment_ids"],
            status="completed",
            overview_table=report_data["overview_table"],
            accuracy_chart_data=report_data["accuracy_chart_data"],
            communication_chart_data=report_data["communication_chart_data"],
            privacy_chart_data=report_data["privacy_chart_data"],
            conclusion_summary=report_data["conclusion_summary"],
            report_data=report_data,
            pdf_size=pdf_size
        )

        db.add(report)
        db.commit()
        db.refresh(report)

        return report

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to generate report: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"生成报告失败: {str(e)}"
        )


@router.get("/{report_id}", response_model=schemas.ReportResponse)
def get_report(report_id: int, db: Session = Depends(get_db)):
    try:
        report = (
            db.query(models.Report)
            .filter(models.Report.id == report_id)
            .first()
        )
        if not report:
            raise HTTPException(status_code=404, detail="报告不存在")
        return report
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get report {report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"获取报告失败: {str(e)}"
        )


@router.get("/{report_id}/pdf")
def get_report_pdf(
    report_id: int,
    sections: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        report = (
            db.query(models.Report)
            .filter(models.Report.id == report_id)
            .first()
        )
        if not report:
            raise HTTPException(status_code=404, detail="报告不存在")

        report_data = report.report_data or {
            "title": report.title,
            "experiment_ids": report.experiment_ids,
            "overview_table": report.overview_table,
            "accuracy_chart_data": report.accuracy_chart_data,
            "communication_chart_data": report.communication_chart_data,
            "privacy_chart_data": report.privacy_chart_data,
            "conclusion_summary": report.conclusion_summary,
        }

        section_list = None
        if sections:
            section_list = [s.strip() for s in sections.split(",") if s.strip()]

        pdf_bytes = generate_report_pdf(report_data, sections=section_list)

        pdf_buffer = io.BytesIO(pdf_bytes)

        filename = f"report_{report_id}.pdf"

        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{filename}; filename=\"{filename}\"",
                "Content-Type": "application/pdf",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate PDF for report {report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"生成PDF失败: {str(e)}"
        )
