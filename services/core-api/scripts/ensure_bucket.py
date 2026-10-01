"""Create the attachments bucket in object storage if it does not exist yet."""

from app.config import settings
from app.storage import build_s3_storage


def main() -> None:
    build_s3_storage().ensure_bucket(settings.s3_region)
    print(f"Bucket {settings.s3_bucket} is ready.")


if __name__ == "__main__":
    main()
