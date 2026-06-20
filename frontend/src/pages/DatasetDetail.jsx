import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Paper, Grid, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, Chip,
  Snackbar, Alert, Divider, List, ListItem,
  ListItemText, IconButton, Tooltip, Slider,
  Checkbox, ListItemButton, Card, CardContent,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Stack
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DeleteIcon from '@mui/icons-material/Delete'
import DatasetIcon from '@mui/icons-material/Dataset'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { datasetApi } from '../services/api'
import PartitionCharts from '../components/PartitionCharts.jsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts'

const MODE_TEXT = {
  iid: 'IID 均匀分布',
  dirichlet: 'Dirichlet 分布',
  label_skew: 'Label Skew 按标签划分'
}

const CLASS_COLORS = [
  '#1976d2', '#dc004e', '#388e3c', '#f57c00', '#7b1fa2',
  '#00796b', '#c62828', '#4527a0', '#ef6c00', '#2e7d32',
  '#00838f', '#ad1457', '#ef6c00', '#1565c0', '#2e7d32',
  '#6a1b9a', '#c62828', '#00695c', '#bf360c', '#4527a0'
]

const PARTITION_COLORS = ['#1976d2', '#388e3c', '#f57c00', '#7b1fa2']

function calculateGiniCoefficient(distributionMatrix) {
  const numClients = distributionMatrix.length
  const clientTotals = distributionMatrix.map(row =>
    row.reduce((sum, val) => sum + val, 0)
  )
  const n = numClients
  let sumDiff = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(clientTotals[i] - clientTotals[j])
    }
  }
  const mean = clientTotals.reduce((s, v) => s + v, 0) / n
  if (mean === 0) return 0
  const gini = sumDiff / (2 * n * n * mean)
  return gini
}

function calculateClassCoverage(distributionMatrix, numClasses) {
  const numClients = distributionMatrix.length
  let totalCovered = 0
  for (let i = 0; i < numClients; i++) {
    let covered = 0
    for (let c = 0; c < numClasses; c++) {
      if (distributionMatrix[i][c] > 0) covered++
    }
    totalCovered += covered
  }
  const avgCovered = totalCovered / numClients
  return (avgCovered / numClasses) * 100
}

function calculateKLDivergence(distributionMatrix, numClasses) {
  const numClients = distributionMatrix.length
  const uniformProb = 1 / numClasses
  let totalKL = 0
  let validClients = 0

  for (let i = 0; i < numClients; i++) {
    const row = distributionMatrix[i]
    const total = row.reduce((s, v) => s + v, 0)
    if (total === 0) continue
    validClients++
    let kl = 0
    for (let c = 0; c < numClasses; c++) {
      const p = row[c] / total
      if (p > 0) {
        kl += p * Math.log2(p / uniformProb)
      }
    }
    totalKL += kl
  }
  return validClients > 0 ? totalKL / validClients : 0
}

export default function DatasetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const datasetId = parseInt(id)

  const [dataset, setDataset] = useState(null)
  const [partitions, setPartitions] = useState([])
  const [partitionDetails, setPartitionDetails] = useState({})
  const [selectedPartition, setSelectedPartition] = useState(null)
  const [loading, setLoading] = useState(true)
  const [partitionLoading, setPartitionLoading] = useState(false)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' })

  const [compareIds, setCompareIds] = useState([])

  const [numClients, setNumClients] = useState(10)
  const [mode, setMode] = useState('iid')
  const [alpha, setAlpha] = useState(0.5)
  const [labelsPerClient, setLabelsPerClient] = useState(5)

  const loadDataset = async () => {
    try {
      const res = await datasetApi.get(datasetId)
      setDataset(res.data)
      if (res.data.num_classes < labelsPerClient) {
        setLabelsPerClient(Math.max(1, res.data.num_classes))
      }
    } catch (e) {
      showSnackbar('加载数据集失败', 'error')
    }
  }

  const loadPartitions = async () => {
    try {
      const res = await datasetApi.listPartitions(datasetId)
      setPartitions(res.data.partitions)
      if (res.data.partitions.length > 0 && !selectedPartition) {
        loadPartitionDetail(res.data.partitions[0].id)
      }
    } catch (e) {
      showSnackbar('加载分片列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadPartitionDetail = async (partitionId) => {
    try {
      const res = await datasetApi.getPartition(datasetId, partitionId)
      setSelectedPartition(res.data)
      setPartitionDetails(prev => ({ ...prev, [partitionId]: res.data }))
    } catch (e) {
      showSnackbar('加载分片详情失败', 'error')
    }
  }

  useEffect(() => {
    loadDataset()
    loadPartitions()
  }, [datasetId])

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false })
  }

  const handleCreatePartition = async () => {
    try {
      setPartitionLoading(true)
      const params = {
        num_clients: numClients,
        mode
      }
      if (mode === 'dirichlet') {
        params.alpha = alpha
      }
      if (mode === 'label_skew') {
        params.labels_per_client = labelsPerClient
      }
      const res = await datasetApi.createPartition(datasetId, params)
      showSnackbar('分片创建成功', 'success')
      setSelectedPartition(res.data)
      setPartitionDetails(prev => ({ ...prev, [res.data.id]: res.data }))
      loadPartitions()
    } catch (e) {
      showSnackbar(e.response?.data?.detail || '分片创建失败', 'error')
    } finally {
      setPartitionLoading(false)
    }
  }

  const handleDeletePartition = async (partitionId, e) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个分片方案吗？')) return
    try {
      await datasetApi.deletePartition(datasetId, partitionId)
      showSnackbar('分片方案已删除', 'success')
      setCompareIds(prev => prev.filter(id => id !== partitionId))
      if (selectedPartition?.id === partitionId) {
        setSelectedPartition(null)
      }
      const newDetails = { ...partitionDetails }
      delete newDetails[partitionId]
      setPartitionDetails(newDetails)
      loadPartitions()
    } catch (e) {
      showSnackbar('删除失败', 'error')
    }
  }

  const handleSelectPartition = (partition) => {
    if (selectedPartition?.id === partition.id) return
    if (!partitionDetails[partition.id]) {
      loadPartitionDetail(partition.id)
    } else {
      setSelectedPartition(partitionDetails[partition.id])
    }
  }

  const handleCompareToggle = (partitionId, e) => {
    e.stopPropagation()
    setCompareIds(prev => {
      if (prev.includes(partitionId)) {
        return prev.filter(id => id !== partitionId)
      } else {
        if (prev.length >= 4) {
          showSnackbar('最多选择4个分片方案进行对比', 'warning')
          return prev
        }
        return [...prev, partitionId]
      }
    })
    if (!partitionDetails[partitionId]) {
      loadPartitionDetail(partitionId)
    }
  }

  const getPartitionDescription = (p) => {
    const parts = [`${p.num_clients} 客户端`]
    if (p.mode === 'dirichlet') {
      parts.push(`α=${p.alpha}`)
    } else if (p.mode === 'label_skew') {
      parts.push(`每客户端 ${p.labels_per_client} 类`)
    }
    return parts.join(' · ')
  }

  const comparisonMetrics = useMemo(() => {
    if (!dataset) return []
    return compareIds.map((id, idx) => {
      const detail = partitionDetails[id]
      const partition = partitions.find(p => p.id === id)
      if (!detail || !detail.distribution_matrix) return null
      return {
        id,
        idx,
        name: partition ? `方案 #${id}` : `方案 #${id}`,
        mode: partition?.mode || 'unknown',
        description: partition ? getPartitionDescription(partition) : '',
        matrix: detail.distribution_matrix,
        gini: calculateGiniCoefficient(detail.distribution_matrix),
        coverage: calculateClassCoverage(detail.distribution_matrix, dataset.num_classes),
        klDivergence: calculateKLDivergence(detail.distribution_matrix, dataset.num_classes),
      }
    }).filter(Boolean)
  }, [compareIds, partitionDetails, partitions, dataset])

  const canCompare = compareIds.length >= 2 && compareIds.length <= 4

  if (loading) {
    return <Typography>加载中...</Typography>
  }

  if (!dataset) {
    return <Typography color="error">数据集不存在</Typography>
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/datasets')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DatasetIcon color="primary" />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {dataset.name}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {dataset.description || '暂无描述'}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              模拟分片
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="客户端数量"
                  type="number"
                  value={numClients}
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    if (val >= 2 && val <= 20) setNumClients(val)
                  }}
                  InputProps={{ inputProps: { min: 2, max: 20 } }}
                  helperText="范围：2 - 20"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>分布模式</InputLabel>
                  <Select
                    value={mode}
                    label="分布模式"
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <MenuItem value="iid">IID 均匀分布</MenuItem>
                    <MenuItem value="dirichlet">Dirichlet 分布</MenuItem>
                    <MenuItem value="label_skew">Label Skew 按标签划分</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {mode === 'dirichlet' && (
                <Grid item xs={12}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Alpha 值: {alpha}
                  </Typography>
                  <Slider
                    value={alpha}
                    onChange={(_, val) => setAlpha(val)}
                    min={0.01}
                    max={100}
                    step={0.01}
                    valueLabelDisplay="auto"
                    marks={[
                      { value: 0.01, label: '0.01' },
                      { value: 1, label: '1' },
                      { value: 10, label: '10' },
                      { value: 100, label: '100' }
                    ]}
                  />
                  <Typography variant="caption" color="text.secondary">
                    alpha 越小，分布越不均匀；alpha 越大，分布越接近均匀
                  </Typography>
                </Grid>
              )}

              {mode === 'label_skew' && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="每客户端标签数"
                    type="number"
                    value={labelsPerClient}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      if (val >= 1 && val <= dataset.num_classes) setLabelsPerClient(val)
                    }}
                    InputProps={{ inputProps: { min: 1, max: dataset.num_classes } }}
                    helperText={`范围：1 - ${dataset.num_classes}（类别总数）`}
                  />
                </Grid>
              )}
            </Grid>

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={handleCreatePartition}
                disabled={partitionLoading}
              >
                {partitionLoading ? '生成中...' : '执行分片'}
              </Button>
            </Box>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              分布可视化
            </Typography>
            {selectedPartition ? (
              <PartitionCharts distributionMatrix={selectedPartition.distribution_matrix} />
            ) : (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography color="text.secondary">
                  请选择或创建一个分片方案以查看分布可视化
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
              数据集信息
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">样本总数</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{dataset.num_samples}</Typography>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">类别数</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{dataset.num_classes}</Typography>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">特征维度</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{dataset.feature_dim}</Typography>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">创建时间</Typography>
                <Typography variant="body2">
                  {format(new Date(dataset.created_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                分片方案 ({partitions.length})
              </Typography>
              {compareIds.length > 0 && (
                <Chip
                  icon={<CompareArrowsIcon />}
                  label={`已选 ${compareIds.length}/4 对比`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Box>

            {partitions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                暂无分片方案
              </Typography>
            ) : (
              <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
                {partitions.map((p) => (
                  <ListItem
                    key={p.id}
                    disablePadding
                    sx={{
                      mb: 0.5,
                    }}
                  >
                    <ListItemButton
                      selected={selectedPartition?.id === p.id}
                      onClick={() => handleSelectPartition(p)}
                      sx={{
                        borderRadius: 1,
                        '&.Mui-selected': {
                          backgroundColor: 'primary.lighter'
                        },
                        '&:hover': {
                          backgroundColor: 'action.hover'
                        },
                        pr: 1,
                      }}
                    >
                      <Checkbox
                        edge="start"
                        checked={compareIds.includes(p.id)}
                        onClick={(e) => handleCompareToggle(p.id, e)}
                        size="small"
                        sx={{ mr: 0.5 }}
                      />
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={MODE_TEXT[p.mode]}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </Box>
                        }
                        secondary={
                          <Box sx={{ mt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {getPartitionDescription(p)}
                            </Typography>
                            <br />
                            <Typography variant="caption" color="text.secondary">
                              {format(new Date(p.created_at), 'MM-dd HH:mm', { locale: zhCN })}
                            </Typography>
                          </Box>
                        }
                      />
                      <Tooltip title="删除">
                        <IconButton
                          edge="end"
                          size="small"
                          color="error"
                          onClick={(e) => handleDeletePartition(p.id, e)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
            {partitions.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                勾选2-4个方案可进行对比分析
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {canCompare && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <CompareArrowsIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              分片方案对比分析
            </Typography>
            <Chip
              label={`${compareIds.length} 个方案`}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ ml: 'auto' }}
            />
          </Stack>

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
            堆叠柱状图对比
          </Typography>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {comparisonMetrics.map((metric) => {
              const numClients = metric.matrix.length
              const numClasses = metric.matrix[0]?.length || 0
              const chartData = Array.from({ length: numClients }, (_, i) => {
                const row = { client: `客户端${i + 1}` }
                for (let c = 0; c < numClasses; c++) {
                  row[`class_${c}`] = metric.matrix[i][c]
                }
                return row
              })

              return (
                <Grid
                  item
                  xs={12}
                  sm={6}
                  md={4}
                  lg={12 / Math.min(4, comparisonMetrics.length)}
                  key={metric.id}
                >
                  <Card
                    variant="outlined"
                    sx={{
                      borderTop: 4,
                      borderColor: `${PARTITION_COLORS[metric.idx]}.main`,
                      height: '100%'
                    }}
                  >
                    <CardContent>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: PARTITION_COLORS[metric.idx]
                          }}
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          方案 #{metric.id}
                        </Typography>
                        <Chip
                          label={MODE_TEXT[metric.mode] || metric.mode}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                        {metric.description}
                      </Typography>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis
                            dataKey="client"
                            tick={{ fontSize: 10 }}
                            interval={Math.max(0, Math.ceil(numClients / 8) - 1)}
                          />
                          <YAxis tick={{ fontSize: 10 }} width={40} />
                          <RechartsTooltip
                            contentStyle={{ fontSize: 11 }}
                            formatter={(value, name) => [`${value} 样本`, `类别${name.replace('class_', '')}`]}
                          />
                          {Array.from({ length: Math.min(numClasses, 10) }, (_, c) => (
                            <Bar
                              key={`class_${c}`}
                              dataKey={`class_${c}`}
                              stackId="a"
                              name={`类别${c}`}
                              fill={CLASS_COLORS[c % CLASS_COLORS.length]}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Grid>
              )
            })}
          </Grid>

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
            数据异质性指标对比
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: '#fafafa' }}>
                  <TableCell sx={{ fontWeight: 700, width: 160 }}>指标</TableCell>
                  {comparisonMetrics.map((metric) => (
                    <TableCell
                      key={metric.id}
                      sx={{
                        fontWeight: 700,
                        borderLeft: 2,
                        borderLeftColor: PARTITION_COLORS[metric.idx],
                        bgcolor: `${PARTITION_COLORS[metric.idx]}08`
                      }}
                    >
                      方案 #{metric.id}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      基尼系数
                      <Tooltip title="衡量样本数量在客户端间的不均匀度。0=完全均匀，值越大约不均匀">
                        <Box
                          sx={{
                            display: 'inline-block',
                            width: 14, height: 14,
                            borderRadius: '50%',
                            bgcolor: '#e3f2fd',
                            color: '#1976d2',
                            fontSize: 10,
                            textAlign: 'center',
                            lineHeight: '14px',
                            fontWeight: 700
                          }}
                        >
                          ?
                        </Box>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  {comparisonMetrics.map((metric) => (
                    <TableCell key={metric.id}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {metric.gini.toFixed(4)}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      类别覆盖率
                      <Tooltip title="各客户端平均覆盖的类别数占总类别数的百分比。100%=每个客户端有所有类别">
                        <Box
                          sx={{
                            display: 'inline-block',
                            width: 14, height: 14,
                            borderRadius: '50%',
                            bgcolor: '#e8f5e9',
                            color: '#388e3c',
                            fontSize: 10,
                            textAlign: 'center',
                            lineHeight: '14px',
                            fontWeight: 700
                          }}
                        >
                          ?
                        </Box>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  {comparisonMetrics.map((metric) => (
                    <TableCell key={metric.id}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                        {metric.coverage.toFixed(2)}%
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      KL 散度均值
                      <Tooltip title="各客户端分布与均匀分布的KL散度平均值。0=完全均匀分布，值越大分布差异越大">
                        <Box
                          sx={{
                            display: 'inline-block',
                            width: 14, height: 14,
                            borderRadius: '50%',
                            bgcolor: '#fff3e0',
                            color: '#f57c00',
                            fontSize: 10,
                            textAlign: 'center',
                            lineHeight: '14px',
                            fontWeight: 700
                          }}
                        >
                          ?
                        </Box>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  {comparisonMetrics.map((metric) => (
                    <TableCell key={metric.id}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.main' }}>
                        {metric.klDivergence.toFixed(4)}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    客户端数
                  </TableCell>
                  {comparisonMetrics.map((metric) => (
                    <TableCell key={metric.id}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {metric.matrix.length}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    总样本数
                  </TableCell>
                  {comparisonMetrics.map((metric) => (
                    <TableCell key={metric.id}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {metric.matrix.flat().reduce((s, v) => s + v, 0).toLocaleString()}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
