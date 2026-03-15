import json
import numpy as np
from pathlib import Path
from ikpy.chain import Chain


# ========= 用户参数 =========
URDF_PATH = Path("../robot/robot.urdf")
OUTPUT_PATH = Path("../workspace_points.json")

NUM_SAMPLES = 80000
# ============================


def get_active_mask(chain):
    """
    自动识别可动关节
    """
    mask = []
    for link in chain.links:
        if link.joint_type in ["revolute", "prismatic"]:
            mask.append(True)
        else:
            mask.append(False)
    return mask


def sample_joint_vector(chain):
    """
    按 joint limits 随机采样
    """
    q = np.zeros(len(chain.links))

    for i, link in enumerate(chain.links):

        if link.joint_type in ["revolute", "prismatic"]:

            lower, upper = link.bounds

            if lower is None:
                lower = -np.pi

            if upper is None:
                upper = np.pi

            q[i] = np.random.uniform(lower, upper)

    return q


def print_robot_info(chain):

    print("\nDetected robot links:\n")

    for i, link in enumerate(chain.links):

        print(
            f"[{i}] {link.name:25s} "
            f"type={link.joint_type:10s} "
            f"limits={link.bounds}"
        )


def main():

    if not URDF_PATH.exists():
        raise FileNotFoundError(URDF_PATH)

    print("Loading URDF:", URDF_PATH.resolve())

    chain = Chain.from_urdf_file(str(URDF_PATH))

    print_robot_info(chain)

    active_mask = get_active_mask(chain)

    print("\nActive joints:")

    for i, (link, flag) in enumerate(zip(chain.links, active_mask)):
        print(f"[{i}] {link.name:25s} {'ACTIVE' if flag else 'fixed'}")

    chain = Chain.from_urdf_file(
        str(URDF_PATH),
        active_links_mask=active_mask
    )

    points = []

    print("\nSampling workspace...")

    for i in range(NUM_SAMPLES):

        q = sample_joint_vector(chain)

        T = chain.forward_kinematics(q)

        pos = T[:3, 3]

        points.append(pos.tolist())

        if (i + 1) % 5000 == 0:
            print(f"{i+1}/{NUM_SAMPLES}")

    points = np.array(points)

    mins = points.min(axis=0).tolist()
    maxs = points.max(axis=0).tolist()

    data = {
        "metadata": {
            "urdf": str(URDF_PATH),
            "num_samples": NUM_SAMPLES,
            "bounds_min": mins,
            "bounds_max": maxs,
            "unit": "meter"
        },
        "points": points.tolist()
    }

    OUTPUT_PATH.parent.mkdir(exist_ok=True)

    with open(OUTPUT_PATH, "w") as f:
        json.dump(data, f)

    print("\nWorkspace saved to:", OUTPUT_PATH.resolve())

    print("\nWorkspace bounds:")
    print("min:", mins)
    print("max:", maxs)


if __name__ == "__main__":
    main()