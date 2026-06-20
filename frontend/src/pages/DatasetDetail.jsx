import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Paper, Grid, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, Chip,
  Snackbar, Alert, Divider, List, ListItem,
  ListItemText, IconButton, Tooltip, Slider
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DeleteIcon from '@mui/icons-material/Delete'
import DatasetIcon from '@mui/icons-material/Dataset'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { datasetApi } from '../services/api'
import PartitionCharts from '../components/PartitionCharts.jsx'

const MODE_TEXT = {
  iid: 'IID 均匀分布',
  dirichlet: 'Dirichlet 分布',
  label_skew: 'Label Skew 按标签划分'
}

export default function DatasetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const datasetId = parseInt(id)

  const [dataset, setDataset] = useState(null)
  const [partitions, setPartitions] = useState([])
  const [selectedPartition, setSelectedPartition] = useState(null)
  const [loading, setLoading] = useState(true)
  const [partitionLoading, setPartitionLoading] = useState(false)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' })

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
      if (selectedPartition?.id === partitionId) {
        setSelectedPartition(null)
      }
      loadPartitions()
    } catch (e) {
      showSnackbar('删除失败', 'error')
    }
  }

  const handleSelectPartition = (partition) => {
    if (selectedPartition?.id === partition.id) return
    loadPartitionDetail(partition.id)
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
                    button
                    selected={selectedPartition?.id === p.id}
                    onClick={() => handleSelectPartition(p)}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      '&.Mui-selected': {
                        backgroundColor: 'primary.lighter'
                      },
                      '&:hover': {
                        backgroundColor: 'action.hover'
                      }
                    }}
                    secondaryAction={
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
                    }
                  >
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
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
