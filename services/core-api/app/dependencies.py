from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.domain import ProjectRole
from app.models import User, UserProject

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from e

    user_id = int(sub)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


class ProjectAccess:
    def __init__(self, required_role: ProjectRole | None = None):
        self.required_role = required_role

    async def __call__(
        self,
        project_id: int,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> UserProject:
        result = await db.execute(
            select(UserProject).where(UserProject.user_id == current_user.id, UserProject.project_id == project_id)
        )
        link = result.scalar_one_or_none()
        if link is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to project")
        if self.required_role and link.role != self.required_role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Requires role: {self.required_role}")
        return link


require_project_access = ProjectAccess()
require_owner = ProjectAccess(required_role=ProjectRole.OWNER)


async def verify_service_token(authorization: str = Header()) -> None:
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service auth header")
    token = authorization[len(prefix) :]
    if token != settings.service_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service token")
