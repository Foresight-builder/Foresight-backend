// 预测事件详情API路由 - 处理单个预测事件的GET请求
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, type Prediction } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await Promise.resolve(params);

    // 验证ID参数
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { success: false, message: '无效的预测事件ID' },
        { status: 400 }
      );
    }

    const predictionId = parseInt(id);

    // 查询预测事件详情
    const { data: prediction, error } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .eq('id', predictionId)
      .single();

    if (error) {
      if ((error as any)?.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, message: '预测事件不存在' },
          { status: 404 }
        );
      }
      console.error('获取预测事件详情失败:', error);
      return NextResponse.json(
        { success: false, message: '获取预测事件详情失败' },
        { status: 500 }
      );
    }

    // 查询押注统计信息
    const { data: betsStats, error: betsError } = await supabaseAdmin
      .from('bets')
      .select('outcome, amount')
      .eq('prediction_id', predictionId);

    let yesAmount = 0;
    let noAmount = 0;
    let totalAmount = 0;
    let participantCount = 0;

    if (!betsError && betsStats) {
      // 计算押注统计
      const uniqueParticipants = new Set();
      
      betsStats.forEach(bet => {
        if (bet.outcome === 'yes') {
          yesAmount += bet.amount;
        } else if (bet.outcome === 'no') {
          noAmount += bet.amount;
        }
        totalAmount += bet.amount;
        // 这里假设bet对象有user_id字段
        if ((bet as any).user_id) {
          uniqueParticipants.add((bet as any).user_id);
        }
      });
      
      participantCount = uniqueParticipants.size;
    }

    // 计算当前概率（基于CPMM恒定乘积做市商模型）
    let yesProbability = 0;
    let noProbability = 0;
    
    if (totalAmount > 0) {
      // 简单的概率计算：基于押注金额比例
      yesProbability = yesAmount / totalAmount;
      noProbability = noAmount / totalAmount;
    } else {
      // 如果没有押注，默认各50%
      yesProbability = 0.5;
      noProbability = 0.5;
    }

    // 构建响应数据
    const predictionDetail = {
      id: prediction.id,
      title: prediction.title,
      description: prediction.description,
      category: prediction.category,
      deadline: prediction.deadline,
      minStake: prediction.min_stake, // 注意字段名映射
      criteria: prediction.criteria,
      referenceUrl: prediction.reference_url, // 注意字段名映射
      status: prediction.status,
      createdAt: prediction.created_at,
      updatedAt: prediction.updated_at,
      stats: {
        yesAmount: parseFloat(yesAmount.toFixed(4)),
        noAmount: parseFloat(noAmount.toFixed(4)),
        totalAmount: parseFloat(totalAmount.toFixed(4)),
        participantCount,
        yesProbability: parseFloat(yesProbability.toFixed(4)),
        noProbability: parseFloat(noProbability.toFixed(4)),
        betCount: betsStats?.length || 0
      },
      // 添加时间信息
      timeInfo: {
        createdAgo: getTimeAgo(prediction.created_at),
        deadlineIn: getTimeRemaining(prediction.deadline),
        isExpired: new Date(prediction.deadline) < new Date()
      }
    };

    return NextResponse.json({
      success: true,
      data: predictionDetail,
      message: '获取预测事件详情成功'
    }, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
    
  } catch (error) {
    console.error('获取预测事件详情异常:', error);
    return NextResponse.json(
      { success: false, message: '获取预测事件详情失败' },
      { status: 500 }
    );
  }
}

// 辅助函数：计算相对时间
function getTimeAgo(timestamp: string): string {
  const now = new Date();
  const created = new Date(timestamp);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 30) return `${diffDays}天前`;
  return '超过一个月前';
}

// 辅助函数：计算剩余时间
function getTimeRemaining(deadline: string): string {
  const now = new Date();
  const end = new Date(deadline);
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) return '已截止';

  const diffDays = Math.floor(diffMs / 86400000);
  const diffHours = Math.floor((diffMs % 86400000) / 3600000);

  if (diffDays > 0) return `${diffDays}天${diffHours}小时后截止`;
  if (diffHours > 0) return `${diffHours}小时后截止`;
  return '即将截止';
}