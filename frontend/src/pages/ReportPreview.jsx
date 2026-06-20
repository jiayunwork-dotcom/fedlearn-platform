import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Button, IconButton, Tooltip, LinearProgress,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Stack, Alert
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar,
  CartesianAxis
} from 'recharts'
import { reportApi } from '../services/api'

const COLORS = [
  '#1976d2',
  '#388e3c',
  '#d32f2f',
  '#f57c00',
  '#7b1fa2',
]

export default function ReportPreview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const reportId = parseInt(id)

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadReport = async () => {
    try {
      setLoading(true)
      const res = await reportApi.get(reportId)
      setReport(res.data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport()
  }, [reportId])

  const handleDownloadPdf = () => {
    reportApi.downloadPdf(reportId)
  }

  if (loading) {
    return <LinearProgress />
  }

  if (error) {
    return (
      <Alert severity="error">
        加载失败: {error}
        <Button onClick={loadReport} sx={{ ml: 2 }}>重试</Button>
      </Alert>
    )
  }

  if (!report) return null

  const accuracyChartData = buildAccuracyChartData(report.accuracy_chart_data)
  const commChartData = buildCommChartData(report.communication_chart_data)
  const hasPrivacyData = report.privacy_chart_data && report.privacy_chart_data.experiments?.length > 0
  const privacyChartData = hasPrivacyData ? buildPrivacyChartData(report.privacy_chart_data) : []

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton onClick={() => navigate('/')}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {report.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              报告 #{report.id} · 创建于 {format(new Date(report.created_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="error"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleDownloadPdf}
          >
            导出 PDF
          </Button>
        </Stack>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                一、实验概况
              </Typography>
              <TableContainer>
                <Table size="small" sx={{ border: '1px solid #e0e0e0' }}>
                  <TableHead sx={{ backgroundColor: '#1976d2' }}>
                    <TableRow>
                      <TableCell sx={{ color: 'white', fontWeight: 'bold', border: '1px solid #e0e0e0' }}>指标</TableCell>
                      {report.overview_table.map((exp, idx) => (
                        <TableCell
                          key={exp.experiment_id}
                          sx={{ color: 'white', fontWeight: 'bold', border: '1px solid #e0e0e0' }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                backgroundColor: COLORS[idx % COLORS.length]
                              }}
                            />
                            {exp.experiment_name}
                          </Box>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>实验ID</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {exp.experiment_id}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>算法</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {exp.algorithm?.toUpperCase()}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>数据集</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {exp.dataset?.toUpperCase()}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>客户端数</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {exp.num_clients}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>轮次数</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {exp.num_rounds}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>最终精度</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0', color: 'success.main', fontWeight: 600 }}>
                          {exp.final_accuracy != null ? `${(exp.final_accuracy * 100).toFixed(2)}%` : '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>总通信量</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {(exp.total_communication / 1024 / 1024).toFixed(2)} MB
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>耗时</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {exp.duration_seconds != null ? `${exp.duration_seconds.toFixed(1)} 秒` : '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>收敛轮次</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {exp.convergence_round ? `第 ${exp.convergence_round} 轮` : '未收敛'}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>单轮平均精度提升</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {exp.avg_round_accuracy_improvement != null
                            ? `${(exp.avg_round_accuracy_improvement * 100).toFixed(3)}%`
                            : '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' }}>精度方差</TableCell>
                      {report.overview_table.map(exp => (
                        <TableCell key={exp.experiment_id} sx={{ border: '1px solid #e0e0e0' }}>
                          {exp.accuracy_variance != null ? exp.accuracy_variance.toFixed(6) : '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                二、精度收敛对比
              </Typography>
              <div className="chart-container" style={{ minHeight: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={accuracyChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      dataKey="round"
                      label={{ value: '通信轮次', position: 'insideBottom', offset: -5 }}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      label={{ value: '全局精度 (%)', angle: -90, position: 'insideLeft' }}
                      tick={{ fontSize: 12 }}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <RechartsTooltip
                      formatter={(value) => [`${value.toFixed(2)}%`, '精度']}
                      labelFormatter={(l) => `第 ${l} 轮`}
                    />
                    <Legend />
                    {report.accuracy_chart_data?.experiments?.map((exp, idx) => (
                      <Line
                        key={exp.experiment_id}
                        type="monotone"
                        dataKey={exp.experiment_name}
                        name={exp.experiment_name}
                        stroke={COLORS[idx % COLORS.length]}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                三、通信效率对比
              </Typography>
              <div className="chart-container" style={{ minHeight: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      label={{ value: '通信量 (MB)', angle: -90, position: 'insideLeft' }}
                      tick={{ fontSize: 12 }}
                    />
                    <RechartsTooltip
                      formatter={(value) => [`${value.toFixed(2)} MB`]}
                    />
                    <Legend />
                    <Bar dataKey="单轮平均通信量" fill="#1976d2" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="总通信量" fill="#388e3c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </Grid>

        {hasPrivacyData && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  四、隐私开销对比
                </Typography>
                <div className="chart-container" style={{ minHeight: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={privacyChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis
                        dataKey="round"
                        label={{ value: '通信轮次', position: 'insideBottom', offset: -5 }}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        label={{ value: '累计 Epsilon 消耗', angle: -90, position: 'insideLeft' }}
                        tick={{ fontSize: 12 }}
                      />
                      <RechartsTooltip
                        formatter={(value) => [value.toFixed(4), 'Epsilon']}
                        labelFormatter={(l) => `第 ${l} 轮`}
                      />
                      <Legend />
                      {report.privacy_chart_data?.experiments?.map((exp, idx) => (
                        <Line
                          key={exp.experiment_id}
                          type="monotone"
                          dataKey={exp.experiment_name}
                          name={exp.experiment_name}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          activeDot={{ r: 6 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {hasPrivacyData ? '五、结论摘要' : '四、结论摘要'}
              </Typography>
              <Paper
                sx={{
                  p: 3,
                  backgroundColor: '#f8f9fa',
                  borderLeft: '4px solid #1976d2'
                }}
              >
                <Typography
                  variant="body1"
                  sx={{
                    lineHeight: 1.8,
                    textIndent: '2em',
                    color: 'text.primary'
                  }}
                >
                  {report.conclusion_summary}
                </Typography>
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, mt: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
        >
          返回实验列表
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<PictureAsPdfIcon />}
          onClick={handleDownloadPdf}
        >
          导出 PDF 报告
        </Button>
      </Paper>
    </Box>
  )
}

function buildAccuracyChartData(chartData) {
  if (!chartData || !chartData.experiments) return []

  const allRounds = new Set()
  chartData.experiments.forEach(exp => {
    exp.data?.forEach(d => allRounds.add(d.round))
  })

  const sortedRounds = Array.from(allRounds).sort((a, b) => a - b)

  return sortedRounds.map(round => {
    const row = { round }
    chartData.experiments.forEach(exp => {
      const point = exp.data?.find(d => d.round === round)
      row[exp.experiment_name] = point ? point.accuracy : null
    })
    return row
  })
}

function buildCommChartData(chartData) {
  if (!chartData || !chartData.experiment_names) return []

  return chartData.experiment_names.map((name, idx) => ({
    name,
    '单轮平均通信量': chartData.avg_communication_per_round?.[idx] || 0,
    '总通信量': chartData.total_communication?.[idx] || 0
  }))
}

function buildPrivacyChartData(chartData) {
  if (!chartData || !chartData.experiments) return []

  const allRounds = new Set()
  chartData.experiments.forEach(exp => {
    exp.data?.forEach(d => allRounds.add(d.round))
  })

  const sortedRounds = Array.from(allRounds).sort((a, b) => a - b)

  return sortedRounds.map(round => {
    const row = { round }
    chartData.experiments.forEach(exp => {
      const point = exp.data?.find(d => d.round === round)
      row[exp.experiment_name] = point ? point.epsilon : null
    })
    return row
  })
}
