"""Development-only YuNet/SFace comparison for two consented fixture images."""

import argparse
import json
from pathlib import Path


def embedding(cv, detector, recognizer, path):
    if Path(path).stat().st_size > 5_000_000:
        raise ValueError("Image file exceeds 5 MB")
    image = cv.imread(path)
    if image is None:
        raise ValueError("Image could not be decoded")
    height, width = image.shape[:2]
    if width * height > 12_000_000:
        raise ValueError("Image is too large")
    detector.setInputSize((width, height))
    _, faces = detector.detect(image)
    if faces is None or len(faces) != 1:
        raise ValueError("Exactly one face is required per image")
    return recognizer.feature(recognizer.alignCrop(image, faces[0]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--detector", required=True, help="YuNet ONNX model")
    parser.add_argument("--recognizer", required=True, help="SFace ONNX model")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--capture", required=True)
    parser.add_argument("--threshold", type=float, default=0.363, help="Demo cosine threshold")
    args = parser.parse_args()
    if not 0.0 < args.threshold <= 1.0:
        parser.error("Threshold must be greater than 0 and at most 1")
    try:
        import cv2 as cv

        detector = cv.FaceDetectorYN.create(args.detector, "", (320, 320))
        recognizer = cv.FaceRecognizerSF.create(args.recognizer, "")
        reference = embedding(cv, detector, recognizer, args.reference)
        capture = embedding(cv, detector, recognizer, args.capture)
        score = float(recognizer.match(reference, capture, cv.FaceRecognizerSF_FR_COSINE))
        print(json.dumps({"similarity": score, "match": score >= args.threshold, "liveness": None}))
    except (ImportError, ValueError, OSError) as error:
        parser.exit(1, f"Face comparison unavailable: {error}\n")


if __name__ == "__main__":
    main()
