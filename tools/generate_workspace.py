import json
import math
import os
from pathlib import Path

import numpy as np
from ikpy.chain import Chain


# ========= 用户需要改的部分 =========
URDF_PATH = Path("../robot/robot.urdf")
OUTPUT_PATH = Path("../workspace_points.json")

# 只保留你真正要采样的活动关节，顺序必须和 IKPy chain 中对应
# 你可以先 print([link.name for link in chain.links]) 看一下名字
ACTIVE_JOINTS = [
    "shoulder_pan_joint",
    "shoulder_lift_joint",
    "elbow_joint",
    "wrist_1_joint",
    "wrist_2_joint",
    "wrist_3_joint",
]

# 单位：弧度
JOINT_LIMITS = {
    "shoulder_pan_joint": [-math.pi, math.pi],
    "shoulder_lift_joint": [-1.57, 1.57],
    "elbow_joint": [-2.2, 2.2],
    "wrist_1_joint": [-math.pi, math.pi],
    "wrist_2_joint": [-2.0, 2.0],
    "wrist_3_joint": [-math.pi, math.pi],
}

# 采样数量
NUM_SAMPLES = 30000

# 是否仅保留位置，不考虑姿态
# 当前脚本只输出末端位置点云
# ==================================


def build_active_links_mask(chain, active_joint_names):
    """
    IKPy 的 Chain.from_urdf_file 返回的 links 里包含 fixed/base 等。
    active_links_mask 需要与 chain.links 等长。
    """
    mask = []
    for link in chain.links:
        name = getattr(link, "name", "")
        mask.append(name in active_joint_names)
    return mask


def sample_joint_vector(chain, active_joint_names, joint_limits):
    """
    IKPy 的 forward_kinematics 输入长度必须等于 len(chain.links)。
    对非活动关节填 0，对活动关节按范围采样。
    """
    q = np.zeros(len(chain.links), dtype=float)
    for i, link in enumerate(chain.links):
        name = getattr(link, "name", "")
        if name in active_joint_names:
            low, high = joint_limits[name]
            q[i] = np.random.uniform(low, high)
        else:
            q[i] = 0.0
    return q


def main():
    if not URDF_PATH.exists():
        raise FileNotFoundError(f"URDF not found: {URDF_PATH.resolve()}")

    print(f"Loading URDF: {URDF_PATH.resolve()}")

    # 先构建临时 chain 看 link 名字
    tmp_chain = Chain.from_urdf_file(str(URDF_PATH))
    print("Detected links/joints in chain:")
    for i, link in enumerate(tmp_chain.links):
        print(f"  [{i}] {getattr(link, 'name', 'unknown')}")

    active_links_mask = build_active_links_mask(tmp_chain, ACTIVE_JOINTS)

    chain = Chain.from_urdf_file(
        str(URDF_PATH),
        active_links_mask=active_links_mask
    )

    print("\nUsing active links mask:")
    for i, (link, flag) in enumerate(zip(chain.links, active_links_mask)):
        print(f"  [{i}] {getattr(link, 'name', 'unknown')}: {'active' if flag else 'fixed'}")

    points = []
    for i in range(NUM_SAMPLES):
        q = sample_joint_vector(chain, ACTIVE_JOINTS, JOINT_LIMITS)
        T = chain.forward_kinematics(q)
        pos = T[:3, 3]
        points.append(pos.tolist())

        if (i + 1) % 5000 == 0:
            print(f"Generated {i + 1}/{NUM_SAMPLES} samples")

    points = np.asarray(points, dtype=float)

    mins = points.min(axis=0).tolist()
    maxs = points.max(axis=0).tolist()

    data = {
        "metadata": {
            "urdf": str(URDF_PATH),
            "num_samples": int(NUM_SAMPLES),
            "active_joints": ACTIVE_JOINTS,
            "joint_limits": JOINT_LIMITS,
            "bounds_min": mins,
            "bounds_max": maxs,
            "unit": "meter"
        },
        "points": points.tolist()
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f)

    print(f"\nSaved workspace points to: {OUTPUT_PATH.resolve()}")
    print(f"Bounds min: {mins}")
    print(f"Bounds max: {maxs}")


if __name__ == "__main__":
    main()