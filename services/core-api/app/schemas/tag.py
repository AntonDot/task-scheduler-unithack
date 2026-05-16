from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    name: str = Field(min_length=1)
    color: str = Field(max_length=50)


class TagRead(BaseModel):
    id: int
    project_id: int
    name: str
    color: str

    model_config = {"from_attributes": True}
